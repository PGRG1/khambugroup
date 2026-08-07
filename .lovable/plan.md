# Fix wrong invoice-line matches (e.g. McCormick Vodka → Bols Blue Curacao)

## What is going wrong

Two separate defects combine to produce what you saw.

**1. The scanned text is overwritten by the matched product's name.**
Whenever a line gets linked — by exact SKU, by fuzzy auto-link, or by you picking a product — the line's `description` and `item_code` fields are replaced with the master product's name and SKU (`InvoiceScanner.tsx` lines 426, 580, 1008-1009). The original OCR text ("MCCORMICK VODKA 100ml") is destroyed. That is why the row now reads "Bols Blue Curacao 70CL" and the suggestion chip proudly reports 100% — it is comparing the master name against itself. You lose all evidence of what the invoice actually said, so a bad match is invisible.

**2. Two paths can link the wrong product in the first place.**
- *Exact SKU path*: `resolveExactMatch` links purely on external SKU equality, with no check that the names have anything in common. A short or generic code on the invoice (or a supplier SKU reused/mis-keyed in the master) links to a completely unrelated product.
- *Fuzzy auto-link path*: auto-link fires at score ≥ 0.92, but the score includes a +0.10 same-supplier boost, +0.06 pack-size boost and +0.05 SKU bonus. A raw name similarity of ~0.80 — two different spirits from the same supplier — can clear the bar and link silently.

The confirmed cause of the display in your screenshot is defect 1. Which of the two link paths produced the underlying bad match on that particular line is not yet confirmed; step 1 below makes that visible in the UI from now on.

## The fix

### 1. Never destroy the scanned text
- Store the OCR values once, on first extraction: `scanned_description`, `scanned_item_code`.
- Stop overwriting `description` / `item_code` in all three link paths. The scanned text stays in the External Name / External SKU cells; the master product appears in the Internal SKU / Internal Name cells, which is where it belongs.
- When the linked master name differs materially from the scanned text, show a small amber "name differs" marker on the row with the master name in a tooltip, plus an **Unlink** action that clears the link and restores the row to unmatched.

### 2. Sanity-gate the exact-SKU match
Before accepting a SKU-only match, require a minimum name agreement between the scanned description and the candidate's supplier/internal name. If the SKU matches but the names are unrelated, do not auto-link: mark the row as a *possible match* with the candidate shown as a suggestion, so you confirm it in one click.
- Skip the gate when the scanned line has no usable description.
- Codes shorter than 4 characters never link on their own.

### 3. Tighten fuzzy auto-link
- Auto-link only when the **raw name score** (before supplier / size / SKU bonuses) clears the bar — bonuses may break ties and rank, but may not by themselves promote a line to auto-link.
- Block auto-link when pack-size tokens conflict (100ml vs 70cl), and when the top two candidates are close.
- Everything else becomes a suggestion chip, exactly as it does today.

### 4. Make the confidence honest
Score the chip against the **scanned** text, never against the already-substituted master name, so a self-referential 100% can no longer appear.

## Technical notes

- `src/utils/productFuzzyMatch.ts`: return the raw name component alongside the boosted score; add a size-conflict flag; use raw score in `classifyCandidates` for the auto-link decision.
- `src/utils/productMasterResolver.ts`: add the name-agreement gate and minimum code length to `resolveExactMatch`; return a `weak: true` signal instead of a hard match when the gate fails.
- `src/components/invoices/InvoiceScanner.tsx`: add `scanned_description` / `scanned_item_code` to the line type and set them at extraction; remove the description/item_code overwrites at lines 426, 580 and 1008-1009; score suggestions from the scanned fields; add the "name differs" marker and Unlink action.
- `ProcurementInvoicesTab.tsx` save path unchanged — it already saves `product_master_id` / `supplier_entry_id`.

No database or edge-function changes. Existing saved invoices are untouched.
