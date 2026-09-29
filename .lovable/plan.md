# Fix scanner Items Master price updates

## Scope
Update only the invoice scanner’s “Update Items Master price” flow and focused tests. Matching, naming, parsing, pricing rules elsewhere, and the database schema remain unchanged.

## Implementation
- Add a focused helper for the supplier-price write so outcomes are testable.
- Require the line’s `supplier_entry_id` and linked product ID; otherwise stop with “This item has no Items Master entry for this supplier”.
- Load that exact supplier entry and linked item, confirming tenant and product ownership.
- Update the supplier entry’s purchase cost with `.select()` and reject errors or zero returned rows.
- Recalculate the linked item’s `cost_per_stock_unit` and `cost_per_base_unit` using supplier conversion quantities first and item quantities as fallback, safely returning zero for invalid or zero divisors.
- Update the item’s `purchase_unit_cost` and both calculated cost fields, also confirming the update returned a row.
- After both writes succeed, refresh the parent Items Master data and update every matching scanner line in the active batch so the new price persists during the session.
- Show success only after verified writes; otherwise show a clear error.

## Validation
- Add focused tests for synchronized supplier/item updates, missing supplier entry, zero-row updates, conversion math, and parent refresh.
- Run focused tests, the full test suite, TypeScript checking, and confirm the live preview build is healthy.
