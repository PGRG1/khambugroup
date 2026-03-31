

## Make Edit Invoice a full-page view matching the Scanner layout

### Problem
The Edit Invoice opens as a dialog overlay while the detail Sheet/drawer may still be visible behind it. The user wants an identical experience to the Invoice Scanner — a clean, full-page view with all Product Master fields visible and no side panel.

### Solution
Replace the Edit Invoice `Dialog` with a full-page overlay (same pattern as the Scanner), and close the detail drawer when entering edit mode. The line items layout will match the scanner screenshot exactly.

### Changes

**File: `src/pages/Invoices.tsx`**

1. **Replace `<Dialog>` with full-page overlay** — Change the edit invoice from a `Dialog` component to a full-screen `Dialog` with `max-w-[98vw] h-[95vh]` or use the same full-page pattern as the Scanner (a conditional render that takes over the content area). Ensure `setDrawerOpen(false)` fires before opening edit.

2. **Match scanner layout exactly** — The line items table already has Internal SKU, Internal Name, External SKU, External Name, Purchase UOM, Purchase Qty, Stock UOM, Stock Qty, Purchase Cost, and Total columns. Verify column widths and ordering match the scanner screenshot:
   - `#` | `Internal SKU` | `Internal Name` | `External SKU` | `External Name` | `Purch. UOM` | `Purch. Qty` | `Stock UOM` | `Stock Qty` | `Purch. Cost` | `Total` | Delete

3. **Remove `max-w-lg` constraint** — Use a full-viewport approach: the DialogContent should use `max-w-none w-[98vw] h-[92vh]` with internal scroll, so the layout doesn't feel cramped and matches the spacious scanner view.

4. **Ensure drawer is fully closed** — Verify `setDrawerOpen(false)` is called in `openEdit` (already present at line 312, but confirm it executes before `setEditOpen(true)`).

### Technical notes
- The edit dialog code (lines 948-1150) already has the correct column structure with ProductAutocomplete integration — the main fix is making it full-page instead of a constrained dialog
- No database changes needed
- Scanner reference layout is at `src/components/invoices/InvoiceScanner.tsx`

