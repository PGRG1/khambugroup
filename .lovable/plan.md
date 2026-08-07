# Fix wrong invoice-line matching system-wide

## What is going wrong

Two separate defects combine to produce what you saw.

**1. The scanned text is overwritten by the matched product's name.**
Whenever a line gets linked — by exact SKU, by fuzzy auto-link, or by you picking a product — the line's `description` and `item_code` fields are replaced with the master product's name and SKU (`InvoiceScanner.tsx` lines 426, 580, 1008-1009). The original OCR text ("MCCORMICK VODKA 100ml") is destroyed. That is why the row now reads "Bols Blue Curacao 70CL" and the suggestion chip proudly reports 100% — it is comparing the master name against itself. You lose all evidence of what the invoice actually said, so a bad match is invisible.

**2. Two paths can link the wrong product in the first place.**
- *Exact SKU path*: `resolveExactMatch` links purely on external SKU equality, with no check that the names have anything in common. A short or generic code on the invoice (or a supplier SKU reused/mis-keyed in the master) links to a completely unrelated product.
- *Fuzzy auto-link path*: auto-link fires at score ≥ 0.92, but the score includes a +0.10 same-supplier boost, +0.06 pack-size boost and +0.05 SKU bonus. A raw name similarity of ~0.80 — two different spirits from the same supplier — can clear the bar and link silently.

This is therefore not a special-case correction for McCormick or Bols. The fix will apply to every scanned invoice line and every product in the master. The confirmed cause of the misleading display is defect 1. Which link path produced any individual bad match is not currently retained; the changes below make the source and evidence visible going forward.

## The fix

### 1. Never destroy the scanned text
- Store the OCR values once, on first extraction: `scanned_description`, `scanned_item_code`.
- Stop overwriting `description` / `item_code` in all three link paths. The scanned text stays in the External Name / External SKU cells; the master product appears in the Internal SKU / Internal Name cells, which is where it belongs.
- When the linked master name differs materially from the scanned text, show a small amber "name differs" marker on the row with the master name in a tooltip, plus an **Unlink** action that clears the link and restores the row to unmatched.

### 2. Sanity-gate every exact-match path
Before accepting an external-SKU or supplier-product match, require minimum agreement between the scanned description and the candidate's supplier/internal name. If the identifier matches but the names are unrelated, do not auto-link: mark the row as a *possible match* with the candidate shown as a suggestion, so you confirm it in one click.
- Skip the gate when the scanned line has no usable description.
- Codes shorter than 4 characters never link on their own.

### 3. Tighten fuzzy auto-link
- Auto-link only when the **raw name score** (before supplier / size / SKU bonuses) clears the bar — bonuses may break ties and rank, but may not by themselves promote a line to auto-link.
- Treat brand/product tokens as essential evidence rather than allowing generic words such as product type, country, or package wording to dominate the score.
- Block auto-link on conflicts in pack size, unit, pack count, or clearly different identifying name/brand tokens (for example 100ml vs 70cl, bottle vs case, or McCormick vs Bols).
- Require a clear confidence margin over the second-best candidate; a high top score is not sufficient when another candidate is nearly tied.
- Everything else becomes a suggestion chip, exactly as it does today.

### 4. Make the confidence honest
Score the chip against the **scanned** text, never against the already-substituted master name, so a self-referential 100% can no longer appear.

### 5. Make uncertain matching safe and fast
- Keep the highest-ranked candidate as **Did you mean?** when it is plausible but not safe enough to auto-link.
- Show the reason a match was held back, such as “size differs”, “name differs”, or “close alternatives”.
- Keep one-click accept, product search, Quick Add, and Unlink available from the same row so stricter matching does not recreate the long workflow.
- Apply the same decision rules after extraction, rescanning, product-master refreshes, and manual unlinking so no alternate UI path can silently bypass the safeguards.

### 6. Add regression coverage for classes of mismatch
Add focused tests around the matching utilities rather than tests for one named product:
- unrelated products sharing a supplier or generic category words;
- exact/reused external SKU with conflicting names;
- same product with harmless punctuation, abbreviation, word-order, or plural differences;
- conflicting size, unit, and pack count;
- close top-two candidates;
- missing descriptions and short codes;
- correct high-confidence matches that should still auto-link.

## Technical notes

- `src/utils/productFuzzyMatch.ts`: separate raw semantic confidence from ranking bonuses; expose conflict and ambiguity reasons; use only safe evidence in `classifyCandidates` for auto-linking.
- `src/utils/productMasterResolver.ts`: apply the name-agreement and code-quality gate to identifier-based resolution; downgrade unsafe exact matches to suggestions instead of hard links.
- `src/components/invoices/InvoiceScanner.tsx`: add immutable `scanned_description` / `scanned_item_code` values at extraction; remove every description/item-code overwrite; score from scanned values; show mismatch reasons and Unlink; route every automatic matching entry point through the same classifier.
- Matching utility tests: cover mismatch categories and valid variants so future threshold changes cannot silently reintroduce false auto-links.
- `ProcurementInvoicesTab.tsx` save path unchanged — it already saves `product_master_id` / `supplier_entry_id`.

No database or edge-function changes. Existing saved invoices are untouched.
