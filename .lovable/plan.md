# Scan Invoice typography and consistency pass

## Scope
Apply styling and wording changes only to the Scan Invoice review screen and its scanner-opened panels. Preserve all handlers, validation, matching, calculations, save gates, data flow, and state.

## Header fields
- Give Supplier, Venue, Invoice #, Status, Invoice date, Due date, and Notes one shared 32px control treatment: 10px horizontal padding, 12px sans text at 400 weight and 16px line-height, including an explicit desktop override.
- Standardize all label rows to 20px high with 11px medium muted text; keep correction chips inline.
- Give Supplier a wider responsive desktop track and make its value occupy one flush-left truncating span with a native full-name tooltip.
- Keep all select chevrons at 16px, half opacity, and non-shrinking.
- Preserve Notes growth while making its initial height match the other controls.

## Line items
- Standardize headers to 11px sentence case and cells/controls to 12px with consistent 28px height and 8px insets.
- Apply monospace tabular, right-aligned treatment to identifiers, units, quantities, prices, discounts, differences, and amounts; keep names, reasons, and notes sans.
- Normalize helper text to 10px and action buttons/status chips to the requested compact scale.
- Align ProductAutocomplete’s input and results without changing its filtering, selection, or scrolling behavior.

## Wording and scanner panels
- Standardize Items Master terminology, expanded table labels, sentence-case headings/buttons/chips, and the requested save-error wording.
- Align SupplierQuickCreateSheet and QuickAddProductPopover labels and controls with the review header.
- Reduce PriceHistoryPanel to 10px labels/helpers, 12px body values, and 15px headline figures.

## Verification
- Run focused scanner tests and inspect the preview build signal.
- Use the live preview at 1280px and 390px to capture computed height, font size, horizontal padding, and font family for all seven header controls.
- Verify a long Supplier value truncates at a 10px inset with a full 16px chevron and title tooltip.
- Report every changed file and confirm no behavioral code changed.
