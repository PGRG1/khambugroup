# Remove invoice source-location highlighting

## Scope

Remove inaccurate source-location evidence from invoice extraction and scanner review while preserving the document viewer and issue navigation.

## Changes

1. **Invoice extraction function**
   - Remove the Agent 1 evidence instruction and evidence example.
   - Remove `evidence` from the extraction tool schema.
   - Remove evidence normalization and attachment to returned invoices.
   - Leave Agent 2, matching, flags, corrections, retries, models, and the response envelope unchanged.

2. **Source document viewer**
   - Reduce the viewer API to `files` only.
   - Remove evidence imports, overlay state/rendering, evidence-driven page switching, box scrolling, labels, and fallback messaging.
   - Preserve image/PDF rendering, manual page/file navigation, zoom controls, fit modes, rotation, double-click zoom, and opening the original.

3. **Invoice scanner**
   - Stop normalizing, storing, and passing evidence.
   - Remove field click/focus handlers and evidence-driven field styling.
   - Keep issue navigation: line issues still center and highlight their row; header issues still scroll the matching field into view using neutral review-field anchors.

4. **Tests and cleanup**
   - Remove dedicated evidence-box tests and unused evidence-only helpers if no callers remain.
   - Update viewer and scanner contract tests to assert that source-location UI/wiring is absent while core viewer controls and issue navigation remain.
   - Add/adjust the parser contract test to confirm Agent 1 no longer requests or normalizes evidence and the response remains `{ success, data: { invoices, review } }`.

5. **Validation and release**
   - Run focused scanner/viewer tests, then the full test suite and TypeScript check.
   - Confirm the preview build is clean.
   - Redeploy and test the `parse-invoice` function without changing its request or response contract.

## Not changed

Supplier matching, item matching/naming, pricing, totals, save behavior, database schema/data, New Targets, or any other invoice workflow.
