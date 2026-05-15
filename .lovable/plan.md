## Procurement Discount Overhaul

Reshape how invoice discounts (line-level + header-level) flow into the journal and into Procurement reporting, removing the silent Suspense plug.

### 1. Schema changes (migration)

`invoice_line_items` — add 3 stored columns:
- `gross_amount numeric` — `qty × unit_price` (before discount/tax)
- `discount_amount numeric` — line discount + allocated share of header discount
- `net_amount numeric` — final posted amount = gross − discount + tax

These are written by the app on save (not generated, so we can include header allocation). Backfill existing rows: `gross = qty*unit_price`, `discount_amount = discount`, `net_amount = total`.

`invoices` — add `needs_review boolean default false` and `review_reason text`.

### 2. Save-time allocation (frontend `useInvoiceData` / `InvoiceScanner` / `ProcurementInvoicesTab`)

When persisting an invoice:
1. For each line compute `gross = qty × unit_price`.
2. Sum line gross.
3. Allocate `invoices.discount` (header) proportionally: `share_i = headerDiscount × gross_i / Σgross` (respect supplier `invoice_rounding_mode`; allocate the rounding remainder onto the largest line).
4. `discount_amount_i = line.discount + share_i`
5. `net_amount_i = gross_i − discount_amount_i + tax_i`
6. `line.total = net_amount_i` (kept for backward compat with existing UIs).
7. Recompute `invoices.subtotal = Σ(gross−discount_amount)`, `tax_amount = Σtax`, `total_amount = Σnet`.
8. If `|Σnet − invoice.total_amount| > 0.02` → set `needs_review=true, review_reason='Discount allocation imbalance'`; otherwise clear.

### 3. Journal posting (`rebuild_journal_from_operations`)

Update the invoice-posting block:
- Skip invoices with `needs_review = true`.
- Debit each mapped procurement account using `li.net_amount` (fallback to `li.total` for legacy rows).
- Credit AP using `invoice.total_amount`.
- Remove the "Rounding → Suspense" plug for invoices. Replace with: if imbalance > 0.02 cents, **delete** the draft entry and flag invoice `needs_review` (via UPDATE in the function) instead of posting to Suspense. Sub-cent (≤ HK$0.02) rounding is allowed to go to Suspense as a true rounding remainder so the journal still balances; this matches the supplier rounding modes already in use.

### 4. Procurement analytics (`ProcurementDashboardTab` + `InvoiceAnalytics`)

Add three KPIs and a per-dimension breakdown:
- **Gross Purchase** = Σ`gross_amount`
- **Supplier Discount** = Σ`discount_amount`  
- **Net Purchase** = Σ`net_amount`

Group-by toggle: Supplier / Venue / Category (L1) / Item / Period (month). Reuse existing date filter chips.

### 5. P&L treatment

Discounts already flow into the same procurement (COGS / OpEx) account because they reduce `net_amount` directly — no separate "Supplier Discounts" GL line is added, but the discount magnitude is fully visible in Procurement analytics. This satisfies "reduce procurement cost / under COGS / not OpEx / not Suspense".

### 6. Needs-Review surface

In `ProcurementInvoicesTab`, add an amber "Needs Review" badge on the row and an "Imbalance: HK$ X.XX" note. Filter chip: All / Needs Review.

---

### Technical / file map

- **Migration**: add columns + backfill + update `rebuild_journal_from_operations`.
- **`src/utils/invoiceRounding.ts`**: add `allocateHeaderDiscount(lines, headerDiscount, mode)` helper.
- **`src/hooks/useInvoiceData.ts`**: in `createInvoice` / `updateInvoice`, compute gross/discount/net per line before insert; recompute invoice totals; set `needs_review`.
- **`src/components/invoices/InvoiceScanner.tsx`** + **`ProcurementInvoicesTab.tsx`**: pass through new fields, show imbalance badge in the editor.
- **`src/components/procurement/ProcurementDashboardTab.tsx`**: add Gross / Discount / Net KPIs and breakdown table.
- **`src/integrations/supabase/types.ts`**: regenerated automatically after migration.
- **Memory**: update `mem://logic/procurement/invoice-calculations` and add `mem://logic/procurement/discount-handling`.

### Out of scope

- No change to Sales discounts (stay as contra-revenue 4150).
- No new "Supplier Discounts" GL account — discounts net into the existing procurement accounts and are reported separately in Procurement analytics. (If you do want a dedicated contra-COGS account showing discounts as their own P&L line, say the word and I'll add it as a follow-up.)
