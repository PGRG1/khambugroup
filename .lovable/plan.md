## Suppliers & Vendors — Complete Upgrade

### What already exists (won't re-do)
- DB columns `categories`, `delivery_days`, `moq`, `account_number` are already on `public.suppliers`.
- `src/components/procurement/SupplierSheet.tsx` already exists from the previous round — it will be **rewritten** to match the new spec (header layout, Profile/Activity/Financial structure, code chip).

### What's actually new

**1. Migration** — only the `code` column is missing:
- Add `code text` to `suppliers`.
- Backfill existing rows: `UPPER(first 3 letters of name) || '-' || zero-padded row_number() per tenant ordered by name` (e.g. `JEB-001`, `ANG-002`).
- Add unique constraint `(tenant_id, code)`.

(Postgres doesn't support `ADD CONSTRAINT IF NOT EXISTS`; will guard with a `DO $$ ... $$` block. Backfill will use a subquery since UPDATE can't use window functions directly.)

**2. `src/components/procurement/SuppliersTab.tsx`**
- Extend `Supplier` interface with `code`.
- Extend `emptyForm` with `code: ""`.
- Add `generateCodeSuggestion(name, existingCodes)` helper.
- `useEffect` on `form.name` (when creating, not editing, and `code` empty) → auto-fill suggested code.
- `openEdit` populates `code`.
- `handleSave`: include `code` in payload (trimmed/null), pre-check duplicate code within tenant and toast error.
- Table columns become: **Code | Name (clickable) | Categories (max 2 badges + "+N") | Delivery days (compact "Mon Wed Fri") | Payment terms | MOQ | Status | Actions (edit/delete icons only)**. Remove Email/Phone columns.
- Name cell opens `SupplierSheet` (new state `selectedSupplier` + `sheetOpen`).
- CSV export includes `code` and new fields.
- Add/Edit dialog: insert **Supplier code** field at top (after Name) with monospace input + helper text; append **Supplier categories** (pill multi-select: Food, Beverages, Packaging, Supplies, Tobacco, Other), **Delivery days** (Mon–Sun day buttons), and a 2-col **MOQ / Account number** row after Notes.

**3. `src/components/procurement/SupplierSheet.tsx`** (rewrite)
- Props: `supplier`, `open`, `onOpenChange`, `onEdit`.
- 680px wide right sheet, fixed header (name + code chip + active badge + terms/MOQ/account inline + Edit button; categories badges + "Delivers: …" row).
- Tabs: **Profile / Activity / Financial**.
  - **Profile**: read-only Contact / Ordering / Notes / "Supplier since" sections.
  - **Activity** (lazy on first open): last 10 invoices + last 5 GRNs (tenant-scoped), with "View all invoices →" link.
  - **Financial** (lazy on first open): 4 KPI cards — This month spend, YTD spend (both from confirmed GRN items: `accepted_qty * unit_cost`), Open payables (sum `remaining_balance` of non-paid/voided invoices), Available credits (approved credit_notes remaining_balance). Footer link to `/procurement/finance`.

### Out of scope (unchanged)
`Procurement.tsx` routing, sidebar, other procurement tabs, invoice scanner, GRN flow, Finance pages, `fetchSuppliers` (uses `select("*")`).

### Technical notes
- Migration order: ALTER → backfill via subquery → guarded `ADD CONSTRAINT`.
- Code suggestion uses initials of words (up to 4 chars), with next sequence based on existing codes sharing that prefix.
- All queries in SupplierSheet scoped by `tenant_id`; activity/financial fetches gated by tab activation to avoid extra work.
