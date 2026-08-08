# Supplier-first invoice line matching

## Part 1 — What I found (verified)

### 1. The two matching layers disagree on supplier — confirmed

- `productMasterResolver.ts` (`resolveProductMatch`, `resolveExactMatch`): when `invoiceSupplier` is set, every branch (SKU, name, entry-id, internal_sku) is supplier-scoped and explicitly refuses to fall through to another supplier's row. Supplier = hard boundary.
- `productFuzzyMatch.ts` (`scoreCandidates`): iterates the **entire** product array; supplier only appears as `+0.1` same-supplier / `−0.05` different-supplier at line 305-310. Supplier = tiebreaker.

Other disagreements between the layers:

| Concern | Exact resolver | Fuzzy scorer |
| --- | --- | --- |
| Supplier | hard boundary | ±0.1 bonus |
| Empty/return qualifier | not considered at all | disqualifies |
| Size conflict | not considered | penalty + blocking reason |
| Non-product lines (delivery, discount) | will happily match them | filtered out |
| Name agreement | `namesAgree` — 60% overlap of *meaningful* tokens (len>2, non-numeric) | `distinctiveTokens` — different stopword list, stemming, supplier-word removal |
| Short codes | `isUsableIdentifier` ≥4 alphanumerics | code only contributes a +0.05 nudge |

So the same line can be exact-matched by one layer to a row the other layer would disqualify (e.g. an empty-keg line whose external SKU matches the full keg — the exact resolver links it silently). That is a real bug independent of this rework.

### 2. There is no supplier entity on products — confirmed, with a nuance

- `public.suppliers` exists: 35 rows, has `id, name, code, account_number, phone, email, address, vendor_code, categories, payment_terms`. **No BR/business-registration number column, no bank account column.**
- `public.product_suppliers` (680 rows) stores `supplier` as **text** — there is no `supplier_id` FK. `product_master.supplier` is also text (596 rows, 17 distinct values).
- Data is currently *tidier than feared*: 27 of 29 distinct `product_suppliers.supplier` values match a `suppliers.name` exactly after punctuation-stripping. The two that don't are exactly the failure mode described: `MING KEE SEAFOOD COMPANY LIMITED 明記海鮮食品有限公司` (vs `Ming Kee Seafood`) and `JEBSEN - BEER DEPT` (vs `Jebsen Beverage`). One row each — an OCR/letterhead variant already leaked into the master.
- `Sze Wo Chaan Co., Ltd` matches **two** supplier rows — a duplicate already exists in `suppliers`.
- `supplier_item_mappings` exists but has **0 rows** and points at `standard_products`, not `product_master`. It is a dead table, not an alias store.
- `invoice_line_items` has `product_master_id` (9,624 of 9,700 linked) but **no `supplier_entry_id` column** — historic lines are linked to the product, not to a supplier's naming of it.

Evidence available for hardening supplier resolution: `suppliers.name`, `code`, `vendor_code`, `account_number`, `phone`, `address`. `parse-invoice` currently extracts **only `supplier_name`** — no account number, no phone, no BR. So evidence-based hardening requires extending the parser output first; it is not available today.

### 3. The distinctive-token gate kills OCR typos — confirmed by scoring run

Against a 3-product mock master, supplier = Jebsen Beverage:

```text
"HOEGARDEN 20L"        -> ask_ai   BR-0011 raw=0.55 dq=true "different brand"
"HOEGAARDEN 20L KEG"   -> auto_link BR-0011 raw=1.00
"STELLA ARTOS 30L KEG" -> suggest   BR-0012 raw=0.80
"MCCORMIC VODKA 100ML" -> suggest   PR-0001 raw=0.75
```

`HOEGARDEN` (one missing `a`) produces distinctive token `hoegarden`, the candidate produces `hoegaarden`, no exact overlap → disqualified before its 0.55 trigram score is ever considered. `STELLA ARTOS` survives only because the *first* token `stella` is spelled correctly. So the gate fails precisely on single-token brand names with an OCR typo — the common case.

## Part 2 — Direction and what I'd change

### Stage 1 — resolve the supplier before any line work

New `src/utils/supplierResolver.ts`: score the scanned `supplier_name` against `suppliers` (name, code, vendor_code) using normalised exact → alias hit → Jaro-Winkler.

- ≥ 0.95 or alias hit → link silently
- 0.75–0.95 → "Is this **Jebsen Beverage**?" confirm/pick/create bar; line matching is blocked until resolved
- < 0.75 → supplier picker + "Add supplier", line matching blocked

Hardening with extra evidence: extend `parse-invoice`'s header schema with `supplier_account_number`, `supplier_phone`, `supplier_br_number`. Account number and phone can be matched against `suppliers.account_number` / `phone` and `supplier_accounts.account_number` today. BR number needs a new `suppliers.br_number` column and manual backfill — I'd add the column but treat it as opt-in, not a resolution requirement. "Remember the layout" is the highest-value cheap trick: store the raw scanned supplier string as a supplier alias on confirmation, so the same letterhead resolves exactly forever after.

### Stage 2 — match lines inside the supplier's catalogue only

`scoreCandidates` gains an explicit scope parameter rather than a bonus:

- Candidate set = rows whose resolved `supplier_id` equals the invoice supplier (typically 40–140 rows here; Beverage World is the largest at 138).
- Inside scope the gate relaxes: `distinctiveTokens` overlap is satisfied by exact stem match **or** Jaro-Winkler ≥ 0.88 between a line token and a candidate token (catches `hoegarden`/`hoegaarden`, `artos`/`artois`, `mccormic`/`mccormick`). Tokens shorter than 5 chars require exact match, to avoid `beef`/`beer`.
- Thresholds inside scope: auto-link ≥ 0.80 raw name score (down from 0.92) with no blocking reason and no ambiguity; suggest ≥ 0.45 (down from 0.60/0.55).
- Thresholds outside scope (Stage 3 only) stay at today's strict values.
- Qualifier guard and size-conflict guard are unchanged and still absolute inside scope.
- Displayed confidence stays `rawNameScore`. The Jaro-Winkler token similarity feeds the *gate*, not the displayed number.

Validation: a fixture file of real scanned descriptions per supplier, taken from `invoice_line_items.description` joined to the `product_master_id` the user actually accepted (9,624 rows available). Replay them through the new scorer and measure auto-link precision and suggestion recall. I would not ship a threshold that produces any wrong auto-link on that set.

### Stage 3 — cross-supplier hit becomes an alias, never a link

If nothing clears the bar inside scope, run the current strict global search. A hit renders as **"This looks like BR-0011 Hoegaarden White 20L Keg (Jebsen). Add it under Beverage World's name and code?"** — the action writes a new `product_suppliers` row (same `product_master_id`, this supplier, scanned name + scanned code) and links the line to it. It never links to another supplier's row.

### Alias schema

```sql
create table public.supplier_aliases (
  id uuid pk, tenant_id uuid not null,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  alias_text text not null,        -- raw scanned letterhead string
  alias_norm text not null,        -- normalised for lookup
  source text not null default 'scan_confirmed',
  created_at, created_by,
  unique (tenant_id, supplier_id, alias_norm)
);

create table public.product_supplier_aliases (
  id uuid pk, tenant_id uuid not null,
  supplier_entry_id uuid not null references product_suppliers(id) on delete cascade,
  alias_text text not null,
  alias_norm text not null,
  alias_code text,                 -- scanned item code, when present
  hit_count int not null default 1,
  last_seen_at timestamptz,
  created_at, created_by,
  unique (tenant_id, supplier_entry_id, alias_norm)
);
```

Both get the standard GRANT + tenant RLS block. One entry can hold many aliases (that is the point — every OCR variant accumulates). At resolution time aliases are checked immediately after exact SKU and before any fuzzy work; an alias hit is an exact match with 100% confidence. `hit_count`/`last_seen_at` let a future cleanup screen show and prune bad aliases.

### Supplier identity migration

1. Add `product_suppliers.supplier_id uuid references suppliers(id)`, nullable at first; keep the `supplier` text column as a display/audit fallback.
2. Backfill by normalised name — 27/29 distinct values match exactly. The three exceptions get explicit mapping rows: `MING KEE SEAFOOD COMPANY LIMITED 明記海鮮食品有限公司 → Ming Kee Seafood`, `JEBSEN - BEER DEPT → Jebsen Beverage`, and a decision on the duplicate `Sze Wo Chaan` supplier rows (merge, then repoint).
3. Same column and backfill on `product_master.supplier`.
4. Seed `supplier_aliases` from the distinct scanned strings, so the two variants above resolve instantly.
5. `invoice_line_items`: add `supplier_entry_id uuid references product_suppliers(id)`. Historic rows are **not** backfilled beyond the unambiguous case (product has exactly one supplier entry) — guessing on 9,624 rows would create false aliases. Nothing about existing posted invoices changes; the column is additive and nullable.

### Files that change

| File | Change |
| --- | --- |
| `src/utils/supplierResolver.ts` | new — supplier scoring, alias lookup, confidence bands |
| `src/utils/productFuzzyMatch.ts` | scope parameter, Jaro-Winkler token gate, in-scope thresholds, keep qualifier + size guards |
| `src/utils/productMasterResolver.ts` | alias lookup step; adopt the qualifier + size guards so the exact path can no longer link an empty keg to a full one |
| `src/hooks/useProductMaster.ts` | expose `supplier_id` and aliases on `PMEntry` |
| `src/hooks/useSupplierAliases.ts` | new — read/write both alias tables |
| `src/components/invoices/InvoiceScanner.tsx` | supplier-confirmation gate before line review; scoped scoring; alias write on confirm; "add under this supplier" action |
| `src/components/invoices/SupplierConfirmBar.tsx` | new |
| `src/components/invoices/ProductSuggestionChip.tsx` | new `mode="cross_supplier_alias"` variant; keep `mode="change"` |
| `src/components/invoices/QuickAddProductPopover.tsx` | reuse for the "add under this supplier" write |
| `supabase/functions/parse-invoice/index.ts` | extract account number / phone / BR; pass supplier scope into the AI shortlist |
| migrations | tables + columns above |

### UI flow

1. Scan completes → **supplier bar** at the top of review: resolved (green, name + "change"), needs confirmation (amber, "Is this X?" + picker), or unresolved (picker + "Add supplier"). Line items are dimmed and matching does not run until the bar is green.
2. On confirm of a fuzzy supplier, the scanned string is saved as a supplier alias (silently, with an undo toast).
3. Lines then match inside scope. Accepting a suggestion writes a product-supplier alias.
4. A cross-supplier hit shows the amber "add under this supplier" chip instead of a match chip.

## Part 2b — Price: three related problems (verified)

### P1. Price flagging inherits the supplier-scoping bug — confirmed

- `linkEntryToLine` (line 421) takes `entry.purchase_unit_cost` as `pmPrice` and derives `price_changed`, `pm_unit_price`, `master_price` from it.
- The resolved branch of `flagLineItemIssues` (line 576) does the same with `resolved.purchase_unit_cost`.
- `selectProduct` (line 1033) does the same with `product.purchase_unit_cost`.

None of these check that the entry belongs to the invoice's supplier. The exact resolver is supplier-scoped so its result is safe; the fuzzy path is not, so an auto-link or applied suggestion can pull a **different supplier's** price in as the baseline. The "PM: $x" hint under Purchase Cost (line 2506) and the `Master: $x` line (line 2567) then present that as this item's agreed price. It never errors — it just reads as a price change. The data makes this plausible in practice: 84 products carry more than one supplier entry and **73 of those have differing prices between suppliers**.

Plan:

- The price baseline comes from the **scoped supplier entry only**. `pmPrice` is read from the entry whose `supplier_id` equals the resolved invoice supplier — never from any other row, and never from `product_master.purchase_unit_cost` as a fallback.
- If a line is linked through any path where the entry's supplier is not the invoice supplier, `pm_unit_price` / `master_price` are left **undefined** and no comparison, no `price_changed` flag, no "PM: $x" hint and no Update-master button is shown. Absence of a comparison beats a misleading one.
- With Stage 3 in place this state should be rare — a cross-supplier hit becomes an "add under this supplier" action, and once the alias row exists the price baseline is that new entry's own price (initially the invoice price).

### P2. `supplier_entry_id` is never set on the manual-pick path — confirmed, live data bug

`selectProduct` (lines 1027-1078) spreads `...currentLine` and sets `product_master_id`, but **never sets `supplier_entry_id`** — unlike `linkEntryToLine` (line 446) and the resolved branch (line 603). It therefore stays null, or worse, stale from a previous link. `applySuggestion` (line 1087) is a thin wrapper over `selectProduct`, and Quick Add / bulk Quick Add route through it too. So the manual autocomplete pick, the accepted suggestion and the Quick Add flows all produce a linked line with no entry id.

`handleUpdateMaster` (line 1311) prefers `product_suppliers` when `supplier_entry_id` is present and **falls back to updating `product_master.purchase_unit_cost`** when it is not. So on the most common path — pick manually, correct the price, press "Update master" — the write lands on the shared product row and changes the displayed price for every supplier carrying that internal SKU.

Evidence that this has already happened: 14 multi-supplier products have a `product_master.purchase_unit_cost` that matches **none** of their supplier entries' prices. That is the signature of a shared-row write that bypassed the per-supplier rows. It is not conclusive on its own (a stale seeded value would look the same), so the plan is to list those 14 for the user to eyeball rather than auto-correct them.

Fix (small, standalone):

- `selectProduct` takes and sets `supplier_entry_id` from the chosen entry (`entry.supplier_entry_id ?? null`), and explicitly nulls it when the picked entry has none, so a stale id can never survive a re-pick.
- `handleUpdateMaster` **refuses** to write when `supplier_entry_id` is absent: toast "This line isn't linked to a supplier-specific entry — link it to this supplier's item first". The silent `product_master` fallback is removed entirely.
- Add the 14 suspect products to a one-off review list (report only, no automated write).

### P3. No price history — proposed table

Today each `product_suppliers` row holds one current cost and Update-master overwrites it, so cost drift and cross-supplier comparison are simply unanswerable.

```sql
create table public.product_supplier_price_history (
  id uuid pk, tenant_id uuid not null,
  supplier_entry_id uuid references product_suppliers(id) on delete cascade,
  product_master_id uuid not null references product_master(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  unit_cost numeric not null,
  purchase_unit text,
  effective_date date not null,
  source text not null,            -- 'invoice_line' | 'master_edit' | 'import' | 'backfill'
  source_invoice_line_id uuid references invoice_line_items(id) on delete set null,
  created_by uuid, created_at timestamptz default now()
);
```

Standard GRANT + tenant RLS. Written on every accepted invoice line at save time and on every master price change (including the Update-master action, which becomes: update the entry **and** append history).

**Backfill.** Yes, from the 9,624 linked `invoice_line_items` rows — but only partially reliable, because `supplier_entry_id` was never populated on those rows. The join has to go invoice → supplier → product_master_id → the matching `product_suppliers` entry. For the 512 products with a single supplier entry that is unambiguous. For the 84 multi-supplier products the correct entry can usually be inferred from the invoice's supplier, but where the invoice's supplier has no entry for that product the row is genuinely ambiguous. Recommendation: backfill only where the invoice supplier resolves to exactly one entry, mark those rows `source = 'backfill'`, and leave the rest out rather than guessing. A partial history is useful; a wrong one poisons the drift chart.

**What it unlocks:** per-supplier cost drift over time (sparkline on the line item and on the product page); cross-supplier comparison for one internal SKU ("Beverage World charges 12% more than Jebsen for BR-0011"); and an audit trail for who changed a master price and why — none of which the single-value schema can answer.

**Should "price changed" compare against history?** Eventually yes, but not as the first move. Recommendation: keep the current-price comparison as the primary flag (it is what the buyer agreed), and add a second, softer signal — "up 8% vs the last 3 invoices from this supplier" — driven by history. A pure history-based flag would fire on every legitimate agreed increase and would be noisy on seasonal produce, which is a large share of this catalogue.

## Sequencing

I agree with your instinct, with one addition.

1. **P2 first, standalone.** It is a two-function fix, has no dependency on supplier identity, and it is actively corrupting shared prices today. Ship on its own with tests.
2. **P1 with the supplier-first rework.** It cannot be properly fixed before scoping exists — "the scoped supplier entry" has no meaning until Stage 2 does. The one part that can go early with P2 is suppressing the comparison when the linked entry's supplier text does not match the invoice supplier; that is a cheap guard using the existing text comparison and I would include it in step 1.
3. **P3 with or just after the supplier work.** The table itself is independent, but the backfill quality depends on supplier identity being resolved, and the write path depends on P2 (a line with no `supplier_entry_id` cannot write a meaningful history row). Create the table and start writing new rows in the same release as the supplier work; run the backfill after.

### Regression tests (`src/test/`)

- `HOEGARDEN 20L` in Jebsen scope → suggests BR-0011 (currently: nothing). Out of scope → still nothing.
- `MCCORMIC VODKA 100ML`, `STELLA ARTOS 30L KEG` → suggest, confidence still the honest raw score.
- `STELLA ARTOIS - 30L KEG - EMPTY` in scope → never matches the full keg, even at the relaxed threshold.
- `1L` vs `70CL` size conflict still blocks in scope.
- Cross-supplier exact name hit → action is `create_alias`, never `auto_link`.
- Alias hit returns 100% confidence and bypasses fuzzy entirely.
- Supplier resolution: `KWAN FUNG LIMITED` / `Kwan Fung Co.` → same supplier; `JEBSEN - BEER DEPT` via seeded alias → Jebsen Beverage; unknown name → unresolved, no line matching attempted.
- `beef`/`beer` short-token case does **not** pass the relaxed gate.

## Part 3 — What I think is wrong or unsupported

- **BR number and bank account are not available.** Neither the `suppliers` table nor `parse-invoice` has them. Realistic hardening evidence today is: account number (needs a parser change), phone, address, and remembered aliases. I'd lean on aliases and drop BR from scope 1.
- **`suppliers` already contains duplicates** (`Sze Wo Chaan` appears twice). Introducing `supplier_id` as the identity makes de-duplication a prerequisite, not a follow-up. This is a small manual data task that belongs in this work.
- **Blocking all line matching behind supplier confirmation adds a click to every scan**, including the 90% that resolve exactly. Worth it only because a silent wrong supplier is currently invisible — but the confident path must stay zero-click.
- **Relaxing to 0.80 auto-link is the risky part of this plan.** With 138 rows in the largest supplier, and beverage catalogues full of near-identical variants (same brand, four pack sizes), I would rather ship the relaxed *suggestion* threshold first and keep auto-link at 0.92 until the replay against the 9,624 accepted historic lines proves 0.80 is clean.
- **`supplier_item_mappings` should be dropped** or explicitly declared dead — leaving an empty, similarly-named table next to the new alias tables will cause confusion.
