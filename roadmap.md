# Roadmap

## Invoice scanner reliability fix (in progress)

- [ ] 1. imageCompression: preserve originals <=3200px & <=4MB; else resize 3200 @ q0.90
- [ ] 2. parse-invoice Agent 1: strict monetary-row segmentation, invoice-no precedence, venue precedence
- [ ] 3. Agent 1 schema: source_line_no + printed_amount; keep printed total; remove Product Master context/matched_sku
- [ ] 4. Agent 2: line_replacements (full replacement array) with >=0.85 confidence + reconciliation gate
- [ ] 5. Shared deterministic structure/total validator (_shared/lineStructure.ts)
- [ ] 6. InvoiceScanner mapping: carry printed_amount/source_line_no; matching must not overwrite external name/SKU
- [ ] 7. Migration: invoice_line_items + scanned_description, scanned_item_code, printed_amount, source_line_no; RPC persists them
- [ ] 8. useInvoiceData: no save-time global rematch for scanner path
- [ ] 9. Printed vs calculated total mismatch blocks save (override path reused)
- [ ] 10. Free goods (unit_price 0) => accepted_price 0, GRN unit_cost 0
- [ ] 11. Jebsen regression tests; full vitest + typecheck + build
