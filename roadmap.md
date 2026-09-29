# Roadmap

## Invoice scanner reliability fix (complete)

- [x] 1. imageCompression preserves originals <=3200px & <=4MB; else resize 3200 @ q0.90
- [x] 2. parse-invoice Agent 1 strict monetary-row segmentation, invoice-no + venue precedence
- [x] 3. Agent 1 returns source_line_no + printed_amount; Product Master removed from extraction
- [x] 4. Agent 2 line_replacements with >=0.85 confidence + reconciliation gate (no third vision call)
- [x] 5. Shared deterministic validator (_shared/invoiceRowStructure.ts)
- [x] 6. Scanner carries printed_amount/source_line_no; matching keeps external name/SKU
- [x] 7. Migration + RPC persist the four source fields
- [x] 8. No save-time global rematch on the scanner path
- [x] 9. Printed vs calculated total mismatch blocks save (override retained)
- [x] 10. Free goods stay zero cost through GRN create/resync
- [x] 11. Jebsen regression tests; 373 tests, typecheck, build pass

## Revenue Trend forecast overlay

- [x] Extend the existing forecast overview model with complete per-day portfolio values
- [x] Overlay the shared daily forecast on Revenue Trend without another query
- [x] Run focused and full tests, type check, and production build

## Remove invoice source-location highlighting

- [x] Remove evidence-box requests and normalization from `parse-invoice`
- [x] Remove source-location overlay and field-driven highlighting from invoice review
- [x] Preserve next/previous issue navigation for rows and header fields
- [x] Update focused tests and run full validation
- [x] Redeploy `parse-invoice`

## Invoice scanner supplier naming consistency

- [x] Route every scanner link and refresh path through the shared link patch
- [x] Enforce supplier-specific Items Master names and SKUs at save time
- [x] Block linked products without an entry for the invoice supplier
- [x] Add focused regression tests and run full validation

## Scanner Items Master supplier-price synchronization

- [x] Require and verify the current supplier entry
- [x] Update supplier price and linked item cost fields together
- [x] Refresh parent data and all matching lines in the active batch
- [x] Add focused tests and run full validation

## Invoice total-mismatch dismissal

- [x] Store and audit the acknowledged printed/calculated pair
- [x] Re-block when calculated amounts change
- [x] Suppress keg-only pickup-note mismatches
- [x] Show acknowledgement feedback only for real dismissals
- [x] Keep save and override gates aligned and run full validation
