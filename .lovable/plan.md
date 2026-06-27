## Waste & Adjustments — Procurement

Build a new page at `/procurement/waste` covering **Wastage** (spoilage, breakage, expiry) and **Internal Consumption** (staff meals, marketing, R&D). Entries deduct from Stock on Hand the same way GRNs add to it.

### 1. Database (migration)

New table `inventory_movements_waste`:
- `tenant_id`, `venue`, `entry_date`
- `entry_type` enum: `waste` | `consumption`
- `reason` text (free-form, with suggested presets per type)
- `product_master_id` (FK), `sku`, `description`, `quantity`, `uom`
- `unit_cost`, `total_value` (generated: `quantity * unit_cost`)
- `notes`, `created_by`, `created_at`, `updated_at`

RLS: tenant-scoped select for `authenticated`; insert/update/delete for `admin` + `manager`. GRANT to authenticated and service_role. Standard updated_at trigger.

### 2. Stock-on-Hand integration

Extend `InventoryOnHandTab` / `get_inventory_aggregates` logic to subtract `SUM(quantity)` from `inventory_movements_waste` (filtered by tenant, venue, and post–last-count date), mirroring the existing GRN add path. Only items with `creates_stock_movement = true` are affected.

### 3. Page `src/pages/procurement/Waste.tsx`

Header: `PageHeader` "Waste & Adjustments" + period filter (All time / This month / Custom) + venue chip filter + "New entry" button.

**KPI row** (4 cards via `KpiGrid`):
- Total waste value (period)
- Waste % of purchases (waste $ ÷ net invoice spend same period)
- Top wasted item (name + value)
- Top reason (label + value)

**Charts row**:
- Bar: Waste by venue
- Bar: Top 10 wasted items / Top reasons (toggle)

**Table** (`DataTableShell`): Date · Venue · Type chip (Waste/Consumption) · SKU · Item · Qty · UOM · Unit cost · Total value · Reason · Notes · Recorded by · Actions (Edit / Delete).
Global search, date range, type filter, venue filter, sortable columns, CSV export (UTF-8 BOM, current filters/sorting), uses `fetchAllRows`.

**Entry dialog** (Add/Edit):
- Date (defaults today), Venue (tenant venues), Type (Waste/Consumption)
- SKU autocomplete from `product_master` (tenant-scoped) → auto-fills description, UOM, unit_cost (editable)
- Quantity, UOM (preselected, editable from `uom_options`)
- Reason — `Select` populated with preset list per type (Waste: Spoilage / Expiry / Breakage / Quality / Over-prep / Other; Consumption: Staff meal / Marketing / R&D / Tasting / Comp / Other), filtered to remove empty strings
- Notes textarea
- Read-only Total value preview (qty × unit cost)
- Zod validation; admin/manager only

### 4. Wiring

- `src/App.tsx`: register route `/procurement/waste` → `Waste` page, wrapped in `ProtectedRoute` with `pageKey="invoices"` (matches sibling procurement pages).
- `src/components/AppSidebar.tsx`: remove `disabled: true` from the existing "Waste & Adjustments" entry.

### 5. Conventions applied

- Tenant filter on every query via `useActiveTenant`.
- Currency/date/qty via `@/utils/format`; `card-glass`, chips, `KpiCard`, `StatusBadge`, `JetBrains Mono` numerics.
- All select dropdowns sanitize empty strings (Radix constraint).
- CSV export with UTF-8 BOM.
- Audit row written to `audit_log` on insert/update/delete.

### Out of scope

- Stock adjustments / corrections (not requested).
- Approval workflow (single-step, recorded-by only).
- Photo attachments.
