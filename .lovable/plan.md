# Invoice total-mismatch dismissal fix

## Scope
Fix only the scanner’s live total-mismatch blocker, acknowledgement behavior, keg-only exception, and related tests. Matching, naming, pricing, extraction, and database persistence remain unchanged.

## Implementation
- Add a small pure reconciliation helper/type for a total-mismatch acknowledgement containing the printed and calculated totals.
- Extend the scanner’s in-memory invoice shape with that acknowledgement pair; it remains scanner state while the required audit record persists through invoice notes.
- Make the total-mismatch check use the same supplier-aware calculated total as today, but suppress it only when the current printed/calculated pair matches the acknowledged pair. Any later amount change produces a different calculated value and restores the blocker.
- Treat a missing or zero printed total as non-blocking when every counted line is a returned-keg line, using the existing `isReturnedKegLine` rule. Keep genuine relevant-line mismatches unchanged.
- Route the synthetic header issue (`index: -1`) to a dedicated acknowledgement path. Append exactly `[Total mismatch acknowledged @ <timestamp>] printed <X>, calculated <Y>` to notes and store the pair on the invoice.
- Make header and line dismissal handlers return/show success feedback only when the referenced finding actually existed and was removed. Invalid or stale indexes produce no success toast.
- Keep Save, Save All, blocking counts, the blocking dialog, and Override & Approve driven by the same acknowledgement-aware predicate; include the live mismatch in the override issue list when present.

## Tests
- Add focused pure tests showing acknowledgement clears the exact mismatch and an amount change restores it.
- Add a keg-only pickup-note test for missing and zero printed totals.
- Add scanner contract/handler tests covering the audit note and ensuring no success toast occurs for a no-op header or line dismissal.
- Run focused tests, the full Vitest suite, TypeScript checking, and confirm the preview build is healthy.
