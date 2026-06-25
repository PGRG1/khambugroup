## Plan

Create `src/utils/syncGrnFromInvoice.ts` with the exact content provided in the request.

Edit `src/components/procurement/ProcurementInvoicesTab.tsx`:
1. Add `import { syncGrnFromInvoice } from "@/utils/syncGrnFromInvoice";` to the imports.
2. In `handleSaveEdit`, after the `updateInvoice(...)` call resolves successfully, invoke `syncGrnFromInvoice(selectedInvoice.id, filteredLines.map(...), { tenantId })` using the field mapping provided. Fire-and-forget — any error is swallowed and does not block the save.

No other files touched.