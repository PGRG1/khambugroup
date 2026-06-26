## Procurement Opening Balances — implementation

Migration already executed:
- ✅ `supplier_opening_balances` (tenant-scoped, unique on tenant+supplier+as_of_date)
- ✅ `deposit_opening_balances` (tenant-scoped, `total_value` generated as qty × unit_value)
- ✅ `credit_notes.is_opening_balance boolean default false`
- ✅ RLS: tenant members can view; only `admin` / `manager` roles can insert / update / delete

Remaining work (build mode):

### 1. `src/pages/procurement/OpeningBalances.tsx` (new)
- Page header + go-live date picker (defaults to today; drives `as_of_date` / `credit_note_date` on every insert)
- Three `card-glass` sections:
  - **Supplier Payables** — table (Supplier · Amount · Venue · As of Date · Notes · Actions) with Add/Edit/Delete dialog writing to `supplier_opening_balances`
  - **Credit Notes** — table of `credit_notes WHERE is_opening_balance=true` (Supplier · CN # · Amount · Remaining · Date · Notes · Status · Void). Add dialog inserts with `status='approved'`, `remaining_balance=amount`, `source_invoice_id=null`, `is_opening_balance=true`, `credit_note_date=goLiveDate`
  - **Deposits** — table (Supplier · SKU · Description · Qty · Unit Value · Total · Venue · Actions). Add/Edit dialog with SKU free-text that queries `product_master.internal_sku` on change and auto-fills description + unit value (overridable). Total shown read-only as qty × unit value
- All reads/writes `.eq('tenant_id', tenantId)` from `useActiveTenant()`; suppliers list also tenant-scoped

### 2. `src/App.tsx`
Add route under existing finance routes:
```
<Route path="/procurement/finance/onboarding"
  element={<ProtectedRoute pageKey="invoices"><OpeningBalances /></ProtectedRoute>} />
```

### 3. `src/components/AppSidebar.tsx`
Add to `procurementFinance` array, directly below "Open Payables":
```
{ title: "Opening Balances", url: "/procurement/finance/onboarding", icon: ClipboardCheck },
```

No other files modified.
