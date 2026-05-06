## Goal

Remove the legacy standalone Invoices page that the user thought was already deleted, and make the Document Centre's "Invoice / Bill" tile open the scanner inside the active Procurement → Invoices tab instead.

## Changes

### 1. Delete legacy page

- Delete `src/pages/Invoices.tsx` (no other file imports it).

### 2. `src/App.tsx`

- Remove the `import Invoices from "./pages/Invoices"` line.
- Remove the `<Route path="/invoices" .../>` entry (line 135).
- Remove the `"/invoices": "invoices"` entry from the route→pageKey map (line 60). The active surface `/procurement/invoices` is already mapped.

### 3. `src/pages/finance/DocumentCentre.tsx`

- Change the `"invoice"` branch in `handlePick` from `navigate("/invoices?scan=1")` to `navigate("/procurement/invoices?scan=1")`.

### 4. Auto-open scanner from query param

In `src/components/procurement/ProcurementInvoicesTab.tsx`, add a small `useEffect` that reads `?scan=1` via `useSearchParams`, opens the InvoiceScanner (the existing `setShowScanner(true)` / equivalent state already used by the "Scan Invoice" button), then clears the param. This makes the Document Centre tile actually launch the scanner instead of just landing on the list.

### 5. Sanity sweep

- `rg "/invoices\b"` after the change to confirm only `/procurement/invoices` remains.
- Leave all `@/components/invoices/*` imports (AttachmentViewerDialog, InvoiceScanner, InvoiceCamera, etc.) untouched — those components are still used by Procurement, DocumentCentre, DocumentsBills, SalesDetailModal, etc.

## Out of scope

- No DB or RLS changes.
- No edits to the Procurement Invoices tab beyond the `?scan=1` auto-open hook.
- No sidebar changes (it already points to `/procurement/invoices`).  
  
  
