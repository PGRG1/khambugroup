# Invoice Scanner — root-cause review and minimal-risk fix plan

## What I verified in the code (not assumptions)

Every point below was confirmed by reading the actual files this turn.

1. **Photos are re-compressed hard, always.** `src/utils/imageCompression.ts:7-8` uses `MAX_DIMENSION = 2400` and `JPEG_QUALITY = 0.65` and applies them to every image regardless of its original size or quality. It only keeps the result if it is smaller (line 50), but a 600 KB phone photo of dense small print still gets re-encoded at 65% — the exact case where thin digits and narrow deposit rows smear.

2. **The extraction prompt never defines what a "line" is.** `supabase/functions/parse-invoice/index.ts:42-140` is very detailed about digits, columns, language and returned kegs, but there is no rule saying *each printed money row with its own qty / UOM / unit price / amount is one line item, even when the Line No column is blank or repeats*. On a Jebsen layout (one printed line number covering a product row plus a deposit row) the model is free to merge both rows into one description. Confirmed: `"Parse ALL line items from each invoice table"` is the only structural instruction.

3. **Agent 2 cannot insert or split rows.** `index.ts:609-672`: the reviewer returns `header_corrections`, `line_corrections`, `line_flags`, `item_master` — all keyed to an existing `line_index`. It has no operation for "this printed row is missing" or "split line 3". So a merge mistake made by Agent 1 is permanently unfixable by Agent 2; the best it can do is raise a math flag.

4. **The printed line amount is thrown away.** `src/components/invoices/InvoiceScanner.tsx:882-899` computes `rawTotal = qty*price - discount + tax` and stores `total: totalStr`. The extracted `li.total` (the AMOUNT column the prompt explicitly asks to read directly) survives only as a transient value passed to the math-flag pruner. Nothing in state or in the DB keeps "what the invoice printed".

5. **Scanned evidence exists only in the browser.** `scanned_description` / `scanned_item_code` are set in scanner state and preserved correctly through match/unmatch (`src/utils/invoiceMatchActions.ts:45-88`) — but `invoice_line_items` has **no** `scanned_description`, `scanned_item_code` or printed-amount column (verified against the live schema). After save, the original printed text is gone.

6. **Matching does rewrite the displayed external fields.** `buildMatchLinkPatch` (`invoiceMatchActions.ts:51-52`) sets `description` to the master's supplier/internal name and `item_code` to the master `external_sku`. That is intentional and recoverable in the UI (the scanned values are captured first), but because of point 5 it is *not* recoverable after save.

7. **Two different matchers run at save time, one of them unscoped.** `InvoiceScanner.doSaveCurrent` resolves unmatched lines through `scopePMToSupplier(productMaster, supplierName)` — correctly supplier-scoped. But `useInvoiceData.createScannerInvoiceWithAttachments` then calls `matchLineItemsToProductMaster` (`src/hooks/useInvoiceData.ts:141-201`), which builds candidates from the **whole tenant's** product master and matches by `external_sku`, then by substring on `supplier_product_name`, then `internal_product_name` — with `entries.find(...)`, i.e. first hit wins, no supplier filter, no score. This can silently attach a wrong `product_master_id` to a line the scanner deliberately left unresolved.

8. **Invoice-total mismatch is not a save gate.** `InvoiceScanner.tsx:1707` computes `totalMismatch` (>HK$0.50) and feeds it into review stats only. `handleSaveCurrent` blocks on missing supplier/number/date, blocking flags and unmatched lines — never on `totalMismatch`. A merged Jebsen row therefore saves cleanly with a silently wrong total.

9. **Extraction and matching are mixed in one call.** `index.ts:140-158` appends the entire product master (`productMasterContext`, no row cap) to the extraction system prompt and instructs the model to return `matched_sku` per line. This inflates the prompt, competes for attention with careful number reading, and makes output vary run to run.

10. **The venue rule is duplicated, not conflicting.** Both prompts say `Knutsford Terrace = Caliente, Assembly = Assembly, Hanabi = Hanabi` (`index.ts:131`, `index.ts:618`). The real weakness is different: the system prompt's opening line and the JSON example mention only *"Assembly or Caliente"* (`index.ts:42`, `index.ts:85`), so Hanabi is under-described, and the venue list is hardcoded rather than taken from the tenant's venue master.

## Fix plan, ordered by priority

Each step is independent and behind no UI redesign.

### P1 — Make one printed row equal one line (the Jebsen bug)
- `supabase/functions/parse-invoice/index.ts`: add an explicit **ROW SEGMENTATION** block to the extraction prompt: every row with its own amount in the AMOUNT column is a separate line item; a blank/repeated Line No never merges rows; deposit / bottle / keg / surcharge rows printed under a product row are their own line; never concatenate two descriptions.
- Add optional `source_line_no` (string) and `printed_amount` (number) to the extraction tool schema, so the model states which printed line number a row came from and what the AMOUNT column said.
- Deterministic guard after Agent 1 (server side, no extra AI cost): if the sum of `printed_amount` disagrees with `total_amount` by more than HK$1, or two lines share a `source_line_no` while one description contains two units/sizes, add a `blocking` line flag. Lives in a new `supabase/functions/_shared/lineSegmentation.ts` so it is unit-testable.

### P2 — Preserve source-document truth end to end
- Migration on `invoice_line_items`: add `scanned_description text`, `scanned_item_code text`, `printed_amount numeric`, `source_line_no text` (all nullable, no backfill, no behaviour change for existing rows).
- `InvoiceScanner.tsx` line mapping (~882-899): keep `total` as today for display/math, but carry `printed_amount: li.total` and `source_line_no` in state, and include all four fields in the save payload.
- `create_scanner_invoice_with_attachments`: accept and persist the four new fields.
- Result: a matched line still *shows* the master name, but the invoice's own words and amount are queryable forever.

### P3 — Stop the unscoped save-time rematch
- `src/hooks/useInvoiceData.ts`: `createScannerInvoiceWithAttachments` stops calling `matchLineItemsToProductMaster`. Scanner lines arrive already resolved by the supplier-scoped resolver; a line the scanner left null must stay null. Keep `matchLineItemsToProductMaster` for the manual `createInvoice` path, but pass the supplier and filter candidates to that supplier there too.

### P4 — Make the printed total a real gate
- `InvoiceScanner.tsx`: add `totalMismatch` to `hasBlockingForSave` (or a sibling check) so a >HK$0.50 gap between the printed invoice total and the computed total blocks save, reusing the existing "Blocking Override + reason" path so a genuine supplier error can still be recorded deliberately.

### P5 — Take matching out of extraction (cost + variability)
- `parse-invoice`: drop `productMasterContext` and `matched_sku` from the Agent 1 prompt entirely. Agent 1 reads the document; Agent 2 (which already owns `item_master` status and already receives an 800-row master summary) owns matching. This shortens the largest prompt in the pipeline, so it also reduces cost.

### P6 — Venue detection from the tenant's own venues
- `parse-invoice`: build the venue instruction from the venue names already passed in (as `supplierNames` is today) instead of hardcoding three names, and state Hanabi on equal footing in the opening line and JSON example.

## Tests to add

- `src/test/lineSegmentation.test.ts` — two rows sharing one `source_line_no` stay two lines; printed-amount sum mismatch raises blocking; a clean single-row invoice raises nothing.
- `src/test/invoiceScannerMapping.test.ts` — mapping keeps `printed_amount` equal to the extracted `li.total` while `total` is the recomputed display value; both survive into the save payload.
- `src/test/invoiceSaveMatching.test.ts` — a scanner line with `product_master_id: null` is saved as null (no silent rematch); a cross-supplier master row with the same `external_sku` is not attached.
- `src/test/invoiceScannerTotalGate.test.ts` — printed vs computed gap above HK$0.50 blocks save; within tolerance saves; override with reason still saves.
- Extend `src/test/invoiceAttachmentMigration.test.ts` style coverage for the four new persisted columns.

## Technical notes

- Migration is additive and nullable only; no destructive SQL, no backfill, no change to existing accounting or rounding.
- GRN creation (`syncGrnFromInvoice` / `sync_grn_from_invoice`) is intentionally untouched. P3 makes it *more* correct by ensuring an unresolved line stays unresolved rather than arriving with a wrongly guessed `product_master_id`; if you also want deposit lines excluded from GRN quantities, that is a separate decision I have not assumed.
- No UI redesign: P4 reuses the existing blocking-override dialog, P2 adds no new visible field.
- AI cost goes **down** (P5 removes the full product-master dump from the extraction prompt); the new segmentation guard is pure server-side arithmetic.
