# Compact Invoice Scanner layout

## Scope
Tighten only the existing Invoice Scanner review workspace. Preserve extraction, matching, evidence, saving, data, and all current line actions.

## Implementation
- Keep the scanner as a bounded viewport with a fixed heading, independent source-document pane, content-sized review header, one flexible line-item viewport, and one fixed footer.
- Compress the right-pane header into a shallow review/workflow summary plus a two-row Supplier, Venue, Invoice #, Status, Invoice Date, Due Date, and Notes form. Remove its ordinary desktop scrollbar and retain responsive wrapping at narrower widths.
- Move Add Line and “Accept all invoice prices” into the line-items heading. Keep the table header sticky and preserve the single visible horizontal/vertical scrollbar on the line-item viewport.
- Reduce desktop row padding and control heights while keeping all match, create, edit, dispute, price, suggestion, and delete actions available.
- Consolidate totals, discount controls, and Back / Scan Another / Save Draft / Approve actions into one shallow fixed footer that can wrap on smaller screens.
- Update the focused scanner layout tests to lock in content-sized header ownership, compact controls, Add Line placement, isolated scrolling, and fixed-footer behavior.

## Validation
- Run the focused scanner tests, full Vitest suite, TypeScript check, and production build.
- Verify the live scanner at desktop and narrower viewport widths, checking that actions stay visible and only line items scroll.

## Assumption
The attached image is visual guidance only; no image asset or simplified replacement table will be added.
