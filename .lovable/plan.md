
Goal

- Enforce one rule everywhere in invoice matching: if an External SKU exists, it is the authoritative key. The External Name must be overwritten from the exact Product Master row for that SKU. Only when no External SKU exists should the app fall back to name matching.

What I found

- The scanner flow still re-resolves rows by `matched_sku` / internal SKU after a user edits or selects a product.
- That is the wrong key for this case, because `141189135M15` and `14189169148` both sit under internal SKU `MET-1010`.
- So the app can correctly see `141189135M15` first, then later re-pick the wrong MET-1010 supplier row and overwrite the External Name back to `CHILLED CUBE ROLL / 7 RIB G/F AUST 36 SOUTH`.
- The procurement editor is closer to correct, but matching logic is duplicated across scanner/editor/save paths, which is why this keeps coming back.

Plan

1. Create one shared Product Master resolver
- Add a small shared matching utility used by scanner and invoice editor.
- Resolution order for assignment will be:
  1. exact External SKU
  2. if no SKU, exact External Name
  3. only then existing linked ids for hydration
- `matched_sku` will stay display metadata only, not the key that decides External Name when an External SKU exists.

2. Fix scanner overwrite logic
- Update `src/components/invoices/InvoiceScanner.tsx`.
- Make `updateLine`, `selectProduct`, `resolvePMData`, and `flagLineItemIssues` all use the shared resolver.
- If `item_code = 141189135M15`, force the matched row to the exact supplier entry for that SKU and force `description = "Chilled Cube Roll A' Aust 3.1K/Up Teys Classic"` regardless of what AI scanned before.
- Remove the current internal-SKU-first re-resolution that is overwriting the chosen name.

3. Preserve the exact chosen supplier row during editing
- Extend scanner line state to carry the exact resolved row identity in UI state (`supplier_entry_id` plus `product_master_id`).
- Use that stored exact row during rechecks instead of guessing again from shared internal SKU values.

4. Align the procurement invoice editor with the same rule
- Update `src/components/procurement/ProcurementInvoicesTab.tsx` to use the same shared resolver.
- Typing or selecting an External SKU will always overwrite External Name from the exact Product Master row.
- Name matching remains fallback-only for suppliers that do not have an External SKU.

5. Fix save-time persistence
- Update save mapping in the scanner so `product_master_id` comes from the exact resolved row, not from `matched_sku` / internal SKU lookups.
- If needed, align the fallback matcher in `src/hooks/useInvoiceData.ts` so persisted matches follow the same SKU-first rule.

6. Safety pass on legacy invoice screen
- Mirror the same resolver in `src/pages/Invoices.tsx` if that screen is still reachable, to avoid split behavior between old and new invoice flows.

Technical details

- No backend schema change is required for this fix.
- The real behavior change is simple:
  - if External SKU exists and exactly matches Product Master, that row wins every time
  - AI-scanned description must not survive against a valid SKU
  - only lines with no External SKU should fall back to exact name matching

Expected result

- Entering or selecting `141189135M15` will always set External Name to `Chilled Cube Roll A' Aust 3.1K/Up Teys Classic`.
- The wrong `MET-1010` sibling row will no longer overwrite it.
- Suppliers with no External SKU will still be matched by exact name as fallback.
