
# Multi-Agent Invoice Scanner

Turn the current single-pass scanner into a two-agent pipeline. Agent 1 keeps doing the extraction it does today. Agent 2 is a new "Reviewer" agent that audits the extracted data for completeness/consistency and reconciles every line against the Items Master, flagging items that don't exist and proposing new Item Master entries the user can accept in one click.

## Agent 1 — Extractor (unchanged behavior)

- Stays in `supabase/functions/parse-invoice/index.ts`.
- Same prompt, same retry loop, same self-verification pass it does today.
- Returns the same `{ invoices: [...] }` shape with `matched_sku` already attempted on each line.

No functional change here — only refactor so the function exposes the extracted payload to Agent 2 before returning.

## Agent 2 — Validator & Item-Master Reviewer (new)

A second AI call inside the same edge function (one round-trip from the client, two agent calls server-side).

Inputs to Agent 2:
- Agent 1's extracted invoices.
- The full Product/Items Master rows already sent by the client.
- The supplier list (so it can sanity-check supplier name vs. existing suppliers).

Agent 2 responsibilities:
1. **Completeness check** — per invoice and per line, flag missing/empty required fields (supplier, invoice #, date, venue, qty, unit_price, total), and flag arithmetic inconsistencies (qty × unit_price − discount ≠ total, or sum of lines ≠ invoice total beyond a small rounding tolerance).
2. **Items Master reconciliation** — for each line:
   - `matched` — confirmed match to an existing Item Master entry (returns `internal_sku` + reason).
   - `ambiguous` — multiple plausible matches (returns top 3 candidate SKUs).
   - `new_item` — no plausible match. Returns a suggested new Item Master draft: `internal_product_name`, `supplier_product_name`, `external_sku`, `pack_size`, `purchase_unit`, `stock_uom`, `purchase_unit_cost`, suggested category (if obvious).
3. Returns a structured `review` object alongside the original invoices, e.g.:

```text
{
  invoices: [...],            // possibly with corrected matched_sku
  review: {
    invoice_issues: [ { invoice_index, field, message, severity } ],
    line_issues:    [ { invoice_index, line_index, type: "math"|"missing"|"unit"|..., message } ],
    item_master:    [ { invoice_index, line_index, status: "matched"|"ambiguous"|"new_item",
                        matched_sku?, candidates?, suggested_new_item? } ]
  }
}
```

Implementation notes:
- Use `google/gemini-2.5-flash` with tool-calling for structured output (matches the existing AI Gateway pattern) so the review payload is reliably typed.
- Same 3-minute timeout + retry pattern as Agent 1.
- If Agent 2 fails, fall back gracefully: return Agent 1's result with `review: null` and a toast on the client ("Review agent unavailable, showing raw extraction").

## Frontend changes — `src/components/invoices/InvoiceScanner.tsx`

- After `supabase.functions.invoke("parse-invoice", ...)` resolves, read the new `review` payload and attach it to each `ScannedInvoice` / line.
- New per-line badges in the scanner review table:
  - green "Matched" (existing behavior, unchanged).
  - amber "Needs review" with tooltip showing Agent 2's message (math mismatch, missing unit, ambiguous match, etc.).
  - blue "New item" with an **"Add to Items Master"** button on the line.
- New top-of-invoice banner summarizing Agent 2's findings: `"Reviewer flagged 3 issues · 2 new items suggested"` with a "Review all" expand.
- **Add to Items Master flow** (per flagged line):
  - Opens the existing Items Master create dialog (or a lightweight inline form if simpler) pre-filled with Agent 2's `suggested_new_item`.
  - On save, the line's `matched_sku` is set to the new SKU and the badge flips to "Matched".
  - Supports "Add all suggested items" bulk action in the banner.
- "Save invoices" stays disabled while there are unresolved blocking issues (missing required fields or unmatched items the user has not explicitly chosen to keep as ad-hoc). Soft issues (math rounding warnings) only show a warning, don't block save.

## No database changes

This is purely an AI-pipeline + UI change. The existing Items Master create path (hook + dialog) is reused for accepting suggestions — no schema migration needed.

## Files touched

- `supabase/functions/parse-invoice/index.ts` — add Agent 2 call, return `review` payload.
- `src/components/invoices/InvoiceScanner.tsx` — consume `review`, render badges/banner, wire "Add to Items Master" action.
- Possibly `src/hooks/useProductMaster.ts` — small helper to create a PM entry from an Agent 2 suggestion if one doesn't already exist.

## Out of scope

- No automatic creation of Item Master entries — user always confirms.
- No changes to supplier auto-creation (still manual per memory).
- No changes to Agent 1's prompt beyond what's needed to hand off cleanly.
