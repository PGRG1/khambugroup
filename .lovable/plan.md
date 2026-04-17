

## Fix: VegFresh subtotal/total rounding

### Problem
On the VegFresh invoice, individual line totals are rounded to 2dp before being summed (e.g., `1.615 × 15.8 = 25.517` → stored as `"25.52"`). Summing those rounded strings gives `1,240.49`, but the true sum of raw line values is `1,240.495` → which should display as `1,240.50` (matches the AI-extracted Doc total).

### Root cause
In `src/components/invoices/InvoiceScanner.tsx`:
- `calcLineTotal` (line 602-610) parses the stored `total` string indirectly by recomputing `qty*price - disc + tax`, which is fine — but then non-BW path returns the raw float. The subtotal sum is correct in memory.
- However, the **displayed** per-line `total` field is `rawTotal.toFixed(2)` (line 400, 505, and inside `updateLine`), and the displayed Subtotal/Total uses `parseFloat(calculatedTotal.toFixed(2))` (line 620).
- The `calculatedTotal` itself sums `calcLineTotal` which returns raw floats — so the in-memory subtotal IS already 1240.495. But `parseFloat((1240.495).toFixed(2))` rounds to `1240.50` in JS… let me re-check: actually `(1240.495).toFixed(2)` in JS = `"1240.49"` due to IEEE 754 (1240.495 is actually 1240.49499...).

### Fix
For VegFresh (and as a general improvement), use a half-up rounding helper instead of relying on `toFixed(2)`'s banker's/IEEE behavior. Apply it to:
1. Subtotal display (line 615)
2. Total display (line 620, non-BW branch)
3. Per-line `total` field formatting (lines 400, 505, and the `updateLine` recomputation around line 540-560)

```ts
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
```

This makes `1240.495 → 1240.50` reliably, and aligns the on-screen subtotal/total with the sum of displayed line totals for VegFresh and all non-BW suppliers.

### Files to update
- `src/components/invoices/InvoiceScanner.tsx` — replace all `rawTotal.toFixed(2)` / `parseFloat(x.toFixed(2))` for non-BW branches with `round2(...).toFixed(2)` (display) or `round2(...)` (numeric). Add `round2` helper near `calcLineTotal`.

### Out of scope
- BW (whole-number) rounding stays unchanged.
- No DB schema or other-file changes.
- `ProcurementInvoicesTab.tsx` and `Invoices.tsx` edit dialogs can get the same helper in a follow-up if the same drift appears there; this fix targets the scanner flow described in the screenshot.

### Verification
1. Re-scan the VegFresh invoice → Subtotal and Total should both read `1,240.50`.
2. Each line total still displays the same 2dp values as before (line-level rounding unchanged).
3. BW invoices still round to whole dollars.
4. Any non-BW supplier where `Σ raw lines` ends in `…495` now rounds up correctly.

