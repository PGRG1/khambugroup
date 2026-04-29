## Goal

Make every product carry an explicit **Financial Treatment** (COGS / OpEx / Asset variants) plus a **Default COA Account**, surface it directly on the Product Master grid, and rewire invoice journal posting to use those two fields. Unmapped products block invoice posting. Deposits flow naturally through Asset – Supplier Deposit (positive = increase, negative = refund).

---

## 1. Database changes (one migration)

### 1a. `product_master` — add 2 columns

```sql
ALTER TABLE public.product_master
  ADD COLUMN financial_treatment text NOT NULL DEFAULT '',
  ADD COLUMN default_coa_account_id uuid NULL REFERENCES public.chart_of_accounts(id);
```

`financial_treatment` allowed values (validated via trigger, not CHECK, per memory rule):
`COGS`, `OpEx`, `Asset - Supplier Deposit`, `Asset - Fixed Asset`, `Asset - Prepayment`, `Asset - Other`, or empty (= unmapped).

A computed view `v_product_mapping_status` returns `Mapped` when both fields are populated, else `Unmapped`.

### 1b. Seed Chart of Accounts (idempotent INSERT … ON CONFLICT DO NOTHING)

If missing, create:
- `1200 Accounts Receivable` (already exists in many setups)
- `1310 Supplier Deposits` (asset)
- `1320 Prepayments` (asset)
- `1500 Fixed Assets` (asset)
- `2100 Accounts Payable` (liability)
- `5100 Beverage COGS`, `5110 Food COGS`, `5120 Packaging COGS`, `5130 Supplies COGS` (cogs)
- `6100 Cleaning & Hygiene Expense`, `6110 Operating Supplies Expense`, `6120 Repairs & Maintenance`, `6130 Marketing`, `6140 Software & Subscriptions` (opex)

Existing accounts are not duplicated — codes are unique.

### 1c. Migrate existing data

Best-effort backfill from current `accounting_category` text:
- Names containing `COGS` → `financial_treatment = 'COGS'`
- Names containing `OpEx` or `Expense` → `'OpEx'`
- Names containing `Deposit` → `'Asset - Supplier Deposit'`
- Names containing `Prepayment` → `'Asset - Prepayment'`
- Names containing `Fixed` → `'Asset - Fixed Asset'`

For each, attempt to match `default_coa_account_id` to an account whose `name` matches the legacy category text. Anything else stays unmapped — surfaced in the UI for manual cleanup.

### 1d. Rewrite `rebuild_journal_from_operations` — invoice block

Re-enable invoice posting (it was paused on Apr 28). For each invoice with status `approved`:

For each invoice line, group by `default_coa_account_id` from the linked `product_master`:
- Debit that account for `SUM(line.total)`.
- If a line has no mapped product OR the product is unmapped, skip the entire invoice and leave `journal_entries` row absent — the invoice surfaces in a new "Invoices blocked from posting" view.
- Credit `Accounts Payable (2100)` for the invoice net total, with `memo = supplier name` so AP is tracked per vendor.

For each `invoice_payments` row:
- Debit Accounts Payable, Credit the cash account mapped via `payment_method_cash` rule (existing logic).

Negative line totals (deposit refunds) naturally produce a credit to Supplier Deposits and a debit to AP — no special case needed.

### 1e. New view `v_invoices_postable`

Returns each invoice with `is_postable boolean` and `unmapped_line_count int` so the UI can flag and block.

---

## 2. Product Master UI (`ProductMasterTab.tsx`)

### 2a. Replace the visible columns with the requested set

```text
Product Name | Supplier | L1 | L2 | L3 | Financial Treatment | Default COA Account | P&L Section | Mapping Status | Active
```

- **Financial Treatment** — coloured pill: green for COGS/OpEx, blue for Asset variants, grey for unmapped.
- **Default COA Account** — shows `code – name`, click to open inline COA picker.
- **P&L Section** — derived, not stored:
  - `COGS` → "COGS"
  - `OpEx` → "Operating Expenses"
  - any `Asset - …` → "Not P&L / Balance Sheet Asset"
  - empty → "—"
- **Mapping Status** — `Mapped` (green) or `Unmapped` (red badge with warning icon). Default sort puts Unmapped first.
- **Active** — existing status pill.

Hide existing columns (Internal SKU, External SKU, UOM/cost columns) behind a "More columns" toggle so the view stays focused on the financial picture. They remain editable in the modal.

### 2b. Edit modal

- Replace the free-text "Accounting Mapping" select with two new inputs:
  1. **Financial Treatment** — Select with the six fixed options.
  2. **Default COA Account** — searchable Combobox over `chart_of_accounts`, filtered by treatment:
     - `COGS` → only `account_type = 'cogs'`
     - `OpEx` → only `account_type = 'opex'`
     - `Asset - *` → only `account_type = 'asset'`
- Show derived **P&L Section** read-only beneath.
- Save is disabled if treatment chosen but COA account empty (or vice-versa) — prevents partial mapping.

### 2c. New filters in the toolbar

- Financial Treatment filter (All / each option / Unmapped)
- Mapping Status filter (All / Mapped / Unmapped)

---

## 3. Invoice posting UI

### 3a. `ProcurementInvoicesTab.tsx`

- New column **Postable** showing a green check or a red "Blocked – N unmapped lines" badge sourced from `v_invoices_postable`.
- The "Approve" / "Post" button is disabled when blocked, with a tooltip listing the unmapped product names.
- Existing "Approval Status" (Pending Review / Approved / Disputed) and "Payment Status" (Unpaid / Partial / Paid) remain as separate columns — already present in the schema.

### 3b. Invoice detail / line items

Each line shows the inherited `Financial Treatment`, `L1 Category`, `P&L Section`, and `Default COA Account` read-only beside the product name so the user can see exactly how it will post.

---

## 4. Reporting impact (`useLedgerPL`, P&L pages)

The ledger-based P&L already aggregates from `journal_lines` by account. After the rewrite:
- COGS section pulls accounts where `account_type = 'cogs'`, grouped by `L1` of the source product (we add `level1_category` to `journal_lines.memo` or a new optional column `category_l1` for grouping — see 4a).
- OpEx section pulls `account_type = 'opex'`, grouped by `L1`.
- Asset accounts never reach P&L, only Balance Sheet — already the case in `useTrialBalance` / `BalanceSheet`.

### 4a. Optional `journal_lines.category_l1`

Add nullable text column populated at posting time from the product's L1, so the P&L can group COGS/OpEx by `Food`, `Beverages`, `Cleaning & Hygiene`, etc. without re-joining product_master at report time. Update `useLedgerPL` to bucket by it.

---

## 5. Files touched

**Created**
- `supabase/migrations/<ts>_product_financial_treatment.sql`

**Edited**
- `src/hooks/useProductMaster.ts` — add `financial_treatment`, `default_coa_account_id`, derived `pl_section` & `mapping_status` to the type and select.
- `src/components/procurement/ProductMasterTab.tsx` — new columns, filters, modal fields.
- `src/components/procurement/ProcurementInvoicesTab.tsx` — postable column + block button.
- `src/components/invoices/LineItemsTab.tsx` — show treatment / COA per line.
- `src/hooks/useLedgerPL.ts` — group COGS/OpEx by `category_l1`.
- `src/hooks/useAccountMapping.ts` — drop the now-unused `invoice_expense` rule entry from the picker (legacy rules left in place for safety; new posting ignores them).

---

## 6. What stays the same

- Sales journal posting, per-venue payment mapping, cashflow ledger — untouched.
- Approval / Payment status fields on `invoices` already exist; no schema change there.
- Existing `accounting_category` text column stays for one release as a fallback display, but is no longer used for posting.

---

## 7. Out of scope (call-outs)

- Supplier-level AP sub-ledger UI (a "by-vendor AP aging" report). The data is in place via AP credits memo'd with supplier name; a dedicated report can come next.
- Auto-creating a unique AP sub-account per supplier. We use a single `2100 Accounts Payable` and rely on the supplier dimension on journal lines for vendor tracking.
