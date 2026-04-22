
## Goal
Add a **Categories** management page where you maintain a hierarchical L1 → L2 → L3 category tree once, then reuse it as dropdowns when editing products and reviewing scanned invoices.

## 1. New table: `product_categories`
A single self-referential table powers all three levels.

```
product_categories
├─ id            uuid PK
├─ name          text          -- e.g. "Beverages" / "Beer" / "Lager"
├─ level         int (1|2|3)
├─ parent_id     uuid → product_categories.id  (null for L1)
├─ sort_order    int
├─ is_active     bool
└─ created_at / updated_at
```
RLS: read = all authenticated; insert/update/delete = admin or manager (matches `product_master`).
Unique index on `(parent_id, lower(name))` to prevent duplicate siblings.

> No backfill of existing `product_master.level1/2/3_category` text values is needed up front — those keep working. We add a one-click **"Import existing categories"** button on the new page that scans `product_master` and creates rows for every distinct L1/L2/L3 combo found.

## 2. New page: **Procurement → Categories**
Route: `/procurement/categories`. Added to the procurement sidebar between **Product Master** and **Invoices**.

Layout — three side-by-side columns (cascading picker style, similar to macOS Finder):

```text
┌─ L1 Categories ──┐ ┌─ L2 (in Beverages) ┐ ┌─ L3 (in Beer) ──┐
│ • Beverages   ✎ │ │ • Beer          ✎  │ │ • Lager       ✎ │
│ • Food        ✎ │ │ • Wine          ✎  │ │ • IPA         ✎ │
│ • Supplies    ✎ │ │ • Spirits       ✎  │ │ • Stout       ✎ │
│ + Add L1        │ │ + Add L2           │ │ + Add L3        │
└──────────────────┘ └────────────────────┘ └─────────────────┘
```

- Click an L1 → L2 column filters to its children → click L2 → L3 column filters again.
- Inline rename (pencil icon), drag-handle for sort order, delete with confirm.
- Top-right buttons: **Import from existing products** (one-time backfill) and **Export CSV**.
- Counts shown per row: e.g. "Beer · 12 products" (live from `product_master`).

## 3. Reuse the categories as dropdowns

### A. Product Master form (`ProductMasterTab.tsx`)
Replace the three free-text `<Input>` fields for L1/L2/L3 (lines 516-518) with cascading `<Select>` dropdowns:
- L1 list = all active L1 rows
- Picking L1 enables L2 (only children of that L1)
- Picking L2 enables L3 (only children of that L2)
- Each dropdown has an **"+ Add new…"** option that opens a tiny inline create dialog so users can extend the tree without leaving the form.

The same cascading dropdown also replaces the **L1 / L3 filter selectors** at the top of the Product Master table (lines 378-385) so filters stay aligned.

### B. Invoice Scanner review screen (`InvoiceScanner.tsx`)
Add a new optional **L1 / L2 / L3** column group on each scanned line item (collapsed behind a "Show categories" toggle to keep the table width reasonable).
- Auto-pre-filled from the matched Product Master row when SKU/name matches.
- User can override per line via the same cascading dropdowns.
- On save, the chosen L1/L2/L3 is written back to `product_master` (creating the row if it's a brand-new product) so the category sticks for next time.

### C. Existing `expense_categories` table — left untouched
That table maps to `category_id` on line items and is a flat list used elsewhere; we keep it for backward compatibility. The new hierarchy is purely the **product** category tree (L1/L2/L3 columns on `product_master`), which is where you actually want the dropdowns.

## 4. Files to add / change

**New**
- `supabase/migrations/<timestamp>_product_categories.sql` — table + RLS + indexes
- `src/hooks/useProductCategories.ts` — fetch/CRUD + tree builder
- `src/components/procurement/CategoriesTab.tsx` — three-column manager
- `src/components/procurement/CategoryCascadeSelect.tsx` — reusable L1→L2→L3 picker with inline "+ Add"

**Edited**
- `src/App.tsx` — add `/procurement/categories` route
- `src/pages/Procurement.tsx` — register `categories` tab + title
- `src/components/AppSidebar.tsx` (procurement section) — add "Categories" nav link
- `src/components/procurement/ProductMasterTab.tsx` — swap L1/L2/L3 inputs and filters for `CategoryCascadeSelect`
- `src/components/invoices/InvoiceScanner.tsx` — add optional L1/L2/L3 columns using `CategoryCascadeSelect`; persist back to `product_master` on save

## Out of scope
- Renaming or merging `expense_categories` (kept as-is)
- Per-venue category overrides
- Translating categories to other languages
