## Suppliers & Vendors — New Fields + Profile Sheet

### 1. Database migration
Add to `public.suppliers`:
- `categories text[] NOT NULL DEFAULT '{}'`
- `delivery_days text[] NOT NULL DEFAULT '{}'`
- `moq numeric NOT NULL DEFAULT 0`
- `account_number text NOT NULL DEFAULT ''`

### 2. Edit `src/components/procurement/SuppliersTab.tsx`
- Extend `Supplier` interface, `emptyForm`, `openEdit`, `handleSave` payload, and `handleExport` CSV columns with the four new fields.
- Add `selectedSupplier` / `sheetOpen` state + `openSheet` handler.
- Replace table columns with: Name (clickable, opens sheet) · Categories (badges) · Delivery days (abbrev) · Payment Terms · MOQ · Status · Actions (Edit/Delete). Remove Email and Phone columns.
- Extend Add/Edit dialog with three new sections after Notes: category pill multi-select (Food, Beverages, Packaging, Supplies, Tobacco, Other), day pill multi-select (Mon–Sun), and 2-col grid for MOQ + Account number.
- Render `<SupplierSheet>` below the table; wire `onEdit` to close sheet then `openEdit`, and `onRefresh` to `fetchSuppliers`.

### 3. New file `src/components/procurement/SupplierSheet.tsx`
Right-side Sheet (`sm:max-w-[700px]`) with header (name + status badge + payment/MOQ/account meta), Edit button, and 3 tabs:
- **Profile** — read-only two-column definition list: Contact (person/email/phone/address), Ordering (payment terms, invoice rounding label via `ROUNDING_MODE_LABELS`, MOQ, account #), Categories badges, Delivery day badges, Notes, Member since.
- **Activity** — lazy-loaded on first open. Fetch last 10 invoices (`invoices` filtered by `supplier_id` + `tenant_id`) and last 5 GRNs (`goods_received_notes`). Two tables with date/number/venue/total/status. Footer link → `/procurement/invoices?supplier=<id>`.
- **Financial** — lazy-loaded. Fetch `grn_items` with joined GRN (filter to this supplier + status `confirmed`), open invoices (not paid), and approved `credit_notes`. Render 4 KPI cards: This-month spend, YTD spend, Open payables (amber), Available credits (green). Footer link → `/finance/payables`.

Use `tenantId` from `useActiveTenant`, currency via `@/utils/format`, and existing `card-glass`/chip patterns.

### Files
- migration (new columns on `suppliers`)
- `src/components/procurement/SuppliersTab.tsx` (edit)
- `src/components/procurement/SupplierSheet.tsx` (new)

### Out of scope
Other procurement tabs, routing, invoice scanner, GRN flow, finance pages, sidebar.
