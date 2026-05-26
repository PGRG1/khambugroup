# Make the Invoice Workflow AI-Native (Revised)

## Goal

Make invoices intelligence-driven: **Bani** extracts, matches, classifies, detects issues, explains what needs review, and **learns from every correction** — without raising AI cost. Re-use the existing `ai-classify` edge function, `ai_learned_rules`, `useAiSuggestion`, and `<AiSuggestionPanel>`. Human always confirms via **Accept Once / Accept & Teach**.

Out of scope this phase: approval routing, auto-approve, payment matching, bank reconciliation.

## Core principles (set by user)

1. **Flash by default. Pro is workflow-gated, capped, never per-render.**
2. **Run AI once per scan, cache results on the invoice.** Review screen reads the cache; no AI fires on mount, scroll, or tab switch.
3. **Line-level intelligence**, with invoice-level defaults only (header supplier/venue is a hint, not a truth).
4. **Strict learned-rule keys** for line→product: must validate `supplier_id + item_code + description + pack_size + unit`. If `pack_size` or `unit` changed since the rule was taught → mark line **Needs Review** (do not auto-apply).
5. **Normalized unit cost** for anomalies (`unit_price ÷ pack_qty`, converted to base UOM). Not raw line totals.
6. **Anomaly records carry reason, evidence, confidence, model_used** — not just a flag list.
7. **Never auto-teach.** Every rule write is a user click.

## Pro fallback policy (strict)

Pro is **disabled by default**. It is allowed only for these workflows, and only when:

| Workflow | Pro trigger | Cap |
|---|---|---|
| `parse_invoice_review` (post-scan rerun) | Flash failed structured-output validation OR Flash returned `total_amount=0` while the doc has line totals | Max **1 Pro call per invoice ever**; result cached on `invoices.ai_extract_meta` |
| `procurement / invoice_anomaly` | Flash returned `confidence < 0.5` AND the invoice has flags requiring narrative explanation | Max **1 Pro call per invoice**, only at scan time |
| All other workflows (`supplier_match`, `line_to_product`, `invoice_categorize`) | **Never** use Pro | 0 |

Every Pro call writes a row to `ai_rule_applications` with `model_used='gemini-2.5-pro'` so we can audit and budget. The edge function refuses a second Pro call for the same `(invoice_id, workflow)` — returns the cached result.

## AI workflows registered in `ai-classify`

| Workflow | Scope | Input | Output | Model |
|---|---|---|---|---|
| `procurement / supplier_match` | invoice header | `{ raw_supplier_name, address_text, fp_hash }` | `{ supplier_id, alias_to_learn, confidence }` | Flash |
| `procurement / line_to_product` | **per line** (batched) | `{ supplier_id, item_code, description, pack_size, unit, unit_price }` | `{ product_master_id, internal_sku, confidence, needs_review_reason? }` | Flash |
| `procurement / invoice_categorize` | **per line** (batched) | `{ supplier_id, product_master_id?, description, line_total }` | `{ category_id, coa_account_id, venue, inventory_treatment, confidence }` | Flash |
| `procurement / invoice_anomaly` | invoice + lines | `{ supplier_id, total_amount, lines:[{product_id, normalized_unit_cost, qty}], history_window }` | `{ flags:[{type, reason, evidence, confidence, suspected_ref?}] }` | Flash (Pro on low-conf) |

`inventory_treatment` ∈ `consumable | resale | service | capex` — line-level.

## Batching (no per-field UI calls)

After scan completes, `parse-invoice` returns the raw extraction. The client then makes **exactly four edge-function calls per invoice**, all server-batched:

```text
1. supplier_match           → 1 call
2. line_to_product (batch)  → 1 call, body = { lines: [...] }
3. invoice_categorize (batch) → 1 call, body = { lines: [...] }
4. invoice_anomaly          → 1 call
```

`ai-classify` learns a new `op: "suggest_batch"` mode that loops internally, hitting the rule cache first per item (free) and only calling Gemini for the unmatched residue, in **one** model call with array I/O. Net cost on a 30-line invoice from a known supplier: typically 1 model call (the anomaly check).

The four results are written to `invoices.ai_suggestions` (jsonb) and `invoice_line_items.ai_suggestion` (jsonb per row) and `invoices.ai_anomaly` (jsonb). The review UI **reads only these columns** — it never calls `ai-classify` on mount.

A small **"Re-run Bani"** button in the review header is the only way to refire AI manually.

## Strict learned rule shape for `line_to_product`

`ai_learned_rules.input_pattern` for this workflow:

```json
{
  "eq_all": {
    "supplier_id": "uuid",
    "item_code": "ABPN001",
    "description_norm": "peroni nastro azzurro",
    "pack_size_norm": "24x330ml",
    "unit_norm": "case"
  }
}
```

Normalization done in `ai-classify` before lookup AND before write:
- `description_norm`: lowercase, collapse whitespace, strip punctuation, strip pack-size tokens
- `pack_size_norm`: parse `24X330ML` → `24x330ml`, `4 x 4 lb` → `4x4lb`
- `unit_norm`: map to canonical (`Case|Bottle|Keg|Bucket|KG|LB|Piece|Dozen|Pack|Bag|Roll|Box`)

Matching rule found but **`pack_size_norm` or `unit_norm` differs** → return suggestion with `needs_review_reason: "pack_size_changed"` (or `unit_changed`). UI shows an amber "Needs Review" chip; user must explicitly re-teach.

## Normalized unit cost for anomalies

For each line we compute and store `normalized_unit_cost`:

```text
pack_qty       = parse_pack_qty(pack_size_norm)   // 24×330ml → 24
base_uom_qty   = convert_to_base(pack_qty, unit_norm) // → 24 bottles, or 7920 ml
normalized_unit_cost = unit_price / base_uom_qty
```

Anomaly comparison is against the **90-day median** `normalized_unit_cost` for `(supplier_id, product_master_id)`. Threshold: `> 1.20×` median = `price_spike`, `< 0.70×` = `price_drop_check`. Computed server-side in the edge function from a single SQL window.

If `product_master_id` is unknown, the line is excluded from price anomalies but can still trigger `unmatched_line` or `duplicate_invoice`.

## Anomaly record shape (rich, not just flags)

`invoices.ai_anomaly` jsonb:

```json
{
  "checked_at": "2026-05-26T...",
  "model_used": "gemini-2.5-flash",
  "confidence": 0.92,
  "flags": [
    {
      "type": "duplicate_invoice",
      "reason": "Same supplier_id + invoice_number found",
      "evidence": { "existing_invoice_id": "uuid", "matched_on": ["supplier_id","invoice_number"] },
      "confidence": 0.99
    },
    {
      "type": "price_spike",
      "reason": "Normalized unit cost 18% above 90-day median",
      "evidence": {
        "line_id": "uuid",
        "product_master_id": "uuid",
        "current_norm_cost": 0.142,
        "median_90d": 0.120,
        "n_observations": 14
      },
      "confidence": 0.88
    }
  ]
}
```

## UI changes

### Review screen (`InvoiceReviewPanels.tsx`)

Top of panel = a **Bani summary card** populated from cached `ai_suggestions`:

```text
┌── Bani — Scan analysis (Flash · 1.2s ago) ────────[Re-run]┐
│ Supplier  ABC Trading Co Ltd   92%  [Once] [Teach]        │
│ Header venue (default) Caliente 95% [Once] [Teach]        │
│                                                            │
│ ⚠ 2 issues need attention                                  │
│   • Possible duplicate of INV-2026-0312                    │
│   • PERONI 24×330ml — unit cost ↑18% vs 90-day median      │
└────────────────────────────────────────────────────────────┘
```

### Line items (`LineItemsTab.tsx`)

Per line, a compact AI cell uses cached `invoice_line_items.ai_suggestion`. No `useAiSuggestion` call fires unless the user clicks **Re-run** or **Teach**.

```text
Product Master:  ⟡ Peroni Nastro 24×330ml   92%  [Once] [Teach]
Category:        ⟡ Beverage — Beer          88%  [Once] [Teach]
Venue:           ⟡ Caliente                 90%  [Once] [Teach]
Inventory:       ⟡ Resale                   95%  [Once] [Teach]
```

When a rule exists but `pack_size_norm`/`unit_norm` changed → amber chip "Needs Review — pack size changed from `24x330ml` to `12x330ml`". Teach is the only way forward.

### Invoice list (`ProcurementInvoicesTab.tsx`)

`⚠` icon column reads `ai_anomaly.flags.length`. Hover-tooltip lists `type · reason`. No AI calls.

## Database (one migration)

Add cache columns. **All AI output lives here; UI reads from here.**

- `invoices.ai_suggestions jsonb` — supplier + header defaults
- `invoices.ai_anomaly jsonb` — full record above
- `invoices.ai_extract_meta jsonb` — `{ model_used, pro_used:boolean, parsed_at, validation_errors }`
- `invoice_line_items.ai_suggestion jsonb` — `{ product, category, coa, venue, inventory, confidence, needs_review_reason }`
- `invoice_line_items.normalized_unit_cost numeric`
- `invoice_line_items.pack_size_norm text`
- `invoice_line_items.unit_norm text`

Indexes: `(supplier_id, product_master_id)` on `invoice_line_items` for the 90-day median window; GIN on `ai_anomaly`.

## Edge function changes (`ai-classify`)

- Register the 4 workflows + their `outputActionSchema`.
- Implement `op: "suggest_batch"` that resolves rule hits first, then makes one Flash call for the remainder.
- Implement Pro gating per the strict policy; refuse a second Pro call on the same `(invoice_id, workflow)`.
- Add normalization helpers (`normalize_description`, `normalize_pack_size`, `normalize_unit`, `parse_pack_qty`, `compute_normalized_unit_cost`).
- Add 90-day median query for price anomalies (single SQL).
- Every call writes to `ai_rule_applications` with `model_used`, `tokens`, `latency_ms`, `cache_hit`, `pro_used`.

`parse-invoice` is unchanged.

## Files touched

**Edit (backend):**
- `supabase/functions/ai-classify/index.ts`

**Edit (frontend, cache reads only — no new AI calls on mount):**
- `src/components/invoices/InvoiceReviewPanels.tsx`
- `src/components/invoices/LineItemsTab.tsx`
- `src/components/procurement/ProcurementInvoicesTab.tsx`
- `src/hooks/useInvoiceData.ts` (read new cache columns)

**Create:**
- `src/components/invoices/ai/BaniScanSummary.tsx` (header card)
- `src/components/invoices/ai/LineAiCell.tsx` (per-line suggestion cell)
- `src/lib/baniRunScan.ts` (orchestrates the 4 batched calls after a scan and writes cache columns)
- One migration: cache columns + indexes

**Do not touch:** `useAiSuggestion`, `AiSuggestionPanel`, `ai_learned_rules` schema, `parse-invoice`.

## Cost model

For a 30-line invoice from a familiar supplier with full rule coverage:
- Supplier: rule hit (0 model calls)
- Line→product: 30 rule hits (0 model calls)
- Categorize: 30 rule hits (0 model calls)
- Anomaly: 1 Flash call (~1.5K input tokens)

→ **1 Flash call per scan steady-state.** New suppliers/products add one Flash call regardless of line count due to batching. Pro is bounded: ≤1 per invoice, ever.

## Verification

1. Scan known supplier invoice → 1 Flash call logged (anomaly only); all other cells filled from rules.
2. Open the same invoice review twice → 0 AI calls (cache reads only).
3. Edit a line's pack size from `24x330ml` to `12x330ml` → next scan with same item_code shows **Needs Review**, not auto-applied.
4. Insert a line priced 25% above 90-day normalized median → anomaly record contains `price_spike` with `current_norm_cost`, `median_90d`, `n_observations`.
5. Force Flash to return invalid JSON → exactly 1 Pro retry logged with `pro_used:true`; second forced failure refuses Pro and surfaces an error.
6. Check `/admin/ai-rules`: new rules from `procurement / line_to_product` carry `eq_all` keys with all 5 normalized fields.

Memory to add after build: `mem://features/ai-native-invoices` documenting the 4 workflows, batching, Pro gating, and cache columns.

Switch to build mode to proceed.