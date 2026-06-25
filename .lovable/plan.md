Update `src/components/procurement/ReceivingTab.tsx` (display only, no logic changes) so the GRN line items table prefers accepted values with fallbacks:

1. **Received qty cell** — replace `it.quantity_received` with:
   ```tsx
   {Number((it as any).accepted_qty ?? it.quantity_received)}
   ```

2. **Unit cost cell** — replace `it.unit_cost` with:
   ```tsx
   {Number((it as any).accepted_price > 0 ? (it as any).accepted_price : it.unit_cost)}
   ```

3. **Line total cell** — replace `quantity_received * unit_cost` with:
   ```tsx
   {Number((it as any).accepted_qty ?? it.quantity_received) * Number((it as any).accepted_price > 0 ? (it as any).accepted_price : it.unit_cost)}
   ```

No other changes to logic, data fetching, or other cells.