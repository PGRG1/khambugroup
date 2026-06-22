## Objective
Restructure the Procurement sidebar section into grouped sub-sections matching the Finance section pattern, rename corresponding tab titles, and add two stub placeholder pages.

## Changes

### 1. AppSidebar.tsx — grouped procurement nav
Replace the flat `procurementItems` array with nested sub-groups using the same `Collapsible` + divider + uppercase sub-label pattern already used in the Finance section.

**Top level (no sub-group):**
- Overview → /procurement/dashboard (LayoutDashboard)

**Sub-group "Master Data":**
- Suppliers & Vendors → /procurement/suppliers (Building2)
- Items Master → /procurement/products (Package)
- Categories & Units → /procurement/categories (Tags)

**Sub-group "Purchasing":**
- Purchase Orders → /procurement/purchase-orders (ShoppingCart)
- Goods Receipts / GRNs → /procurement/receiving (PackageCheck)
- Invoices → /procurement/invoices (FileSpreadsheet)
- Purchase Register → /procurement/line-items (ListChecks)
- Credit & Debit Notes → /procurement/credit-notes (FileMinus)
- Documents → /procurement/documents (FolderDown)

**Sub-group "Inventory":**
- Stock on Hand → /procurement/inventory (ClipboardList)
- Stock Counts → /procurement/stock-counts (ClipboardCheck)
- Stock Movements → /procurement/stock-movements (ArrowLeftRight) — opacity-40, pointer-events-none
- Transfers → /procurement/transfers (ArrowsRightLeft) — opacity-40, pointer-events-none
- Waste & Adjustments → /procurement/waste (Trash2) — opacity-40, pointer-events-none

**Sub-group "Costing":**
- Recipes & Menu Costing → /procurement/menu-costing (UtensilsCrossed)

**Sub-group "Analysis":**
- Purchase Analysis → /procurement/purchase-analysis (BarChart3) — opacity-40, pointer-events-none
- Supplier Pricing → /procurement/supplier-pricing (Tag) — opacity-40, pointer-events-none
- Inventory Variance → /procurement/inventory-variance (TrendingDown) — opacity-40, pointer-events-none

Add missing lucide-react imports: `ListChecks`, `FileMinus`, `ClipboardCheck`, `ArrowLeftRight`, `ArrowsRightLeft`, `Trash2`, `Tag`, `TrendingDown`.

### 2. Procurement.tsx — rename tab titles
Update `tabTitles` map:
- `"categories"` → `"Categories & Units"`
- `"inventory"` → `"Stock on Hand"`
- `"menu-costing"` → `"Recipes & Menu Costing"`
- `"receiving"` → `"Goods Receipts / GRNs"`
- `"line-items"` → `"Purchase Register"`

### 3. Two stub pages
Create `src/pages/procurement/CreditNotes.tsx` and `src/pages/procurement/StockCounts.tsx`. Each renders a page heading and a card with the text "This page is being built."

### 4. App.tsx — wire new routes
Add AdminRoutes:
- `/procurement/credit-notes` → CreditNotes
- `/procurement/stock-counts` → StockCounts

## Scope
Only touches: `AppSidebar.tsx`, `Procurement.tsx`, `src/App.tsx`, and the two new stub files. No schema changes, no other components modified.