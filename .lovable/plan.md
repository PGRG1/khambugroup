

## Suppliers Tab for Procurement

### What
Add a new "Suppliers" tab to the Procurement page that serves as the master list for all suppliers. This tab will provide CRUD operations on the existing `suppliers` database table (already has: `name`, `contact_person`, `email`, `phone`, `address`, `notes`, `payment_terms`, `is_active`).

### Why
Currently, supplier names are stored as free-text strings across Product Master and Invoices. A dedicated Suppliers tab centralizes supplier management and will serve as the canonical source for supplier data throughout the system.

### Plan

**1. Create `SuppliersTab` component** (`src/components/procurement/SuppliersTab.tsx`)
- Table displaying all suppliers with columns: Name, Contact Person, Email, Phone, Payment Terms, Status (Active/Inactive), Notes
- Search/filter bar
- Add Supplier dialog (form with all fields)
- Inline edit or edit dialog for existing suppliers
- Delete with confirmation
- CSV export
- Uses `supabase.from("suppliers")` directly (table already exists with proper RLS)

**2. Add tab to Procurement page** (`src/pages/Procurement.tsx`)
- New tab trigger with `Building2` icon and "Suppliers" label, placed after Dashboard
- Import and render `SuppliersTab` component

**3. No database changes needed** — the `suppliers` table already exists with appropriate columns and RLS policies (admin/manager can manage, authenticated can read).

### Technical details
- Component follows the same patterns as `ProductMasterTab` (table + dialog + filters)
- Queries `supabase.from("suppliers")` for CRUD
- Payment terms options: COD, Net 7, Net 14, Net 30, Net 60
- Status toggle between active/inactive via `is_active` boolean

