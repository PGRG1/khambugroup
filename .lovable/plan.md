# Make match confidence honest — no suggestions for unrelated items

## What I verified

Running the current scorer against sample lines:

```text
"HOEGAARDEN - 20L KEG Ref No. 6B15"  -> Hoegaarden 20L Keg   shown 0.98  real name score 0.82
"MCCORMICK VODKA 100ml"              -> Stella / Carlsberg   0.10        real 0.03-0.06  (action: ask_ai)
"Delivery Charge" / "Random Widget"  -> no candidates                    (action: ask_ai)
```

Two confirmed problems:

1. **The percentage shown is not the match confidence.** The number on the chip is the *ranking* score, which includes same-supplier, pack-size and SKU bonuses. Hoegaarden displays 98% when the actual name agreement is 82%. Bonuses are for ordering candidates, not for telling you how sure we are.
2. **The AI fallback has no floor and no sanity check.** When nothing local clears the bar (the vodka case above), the line goes to "ask AI"; whatever product the AI returns is written straight in as a suggestion, defaulting to 70% confidence if the AI gives none. Nothing checks that the returned product bears any resemblance to the scanned line. This is the path that puts Stella or a random beer under an unrelated line.

## The fix

### 1. Show the real confidence
The chip shows the name-agreement score (scored against the original scanned text), not the boosted ranking score. Bonuses continue to order candidates; they never inflate the displayed percentage.

### 2. Qualifier words are part of the product identity

Confirmed in the code: nothing anywhere treats "EMPTY" (or RETURN, DEPOSIT, FULL, SAMPLE, FOC) as meaningful, and keg/bottle/case are in the stopword list. So "STELLA ARTOIS - 30L KEG (B) - EMPTY KEG" scores as if it read "Stella Artois 30L", which is why the ordinary Stella keg is offered even though the correct empty-keg product exists in the master.

- Qualifier words become a hard attribute of the line, extracted from the scanned text: empty / return / deposit vs full / normal.
- A candidate with a different qualifier is a **conflict**: it cannot auto-link and cannot be the "did you mean" suggestion — same class of block as a size conflict, reason shown as "empty/return item".
- A candidate carrying the same qualifier is preferred over the plain product, so the empty-keg master entry ranks first for this line.
- The same rule applies to the exact-code path, so a supplier SKU shared between the full and empty variants cannot link to the wrong one.

### 3. Raise the bar for showing anything
- A suggestion appears only when name agreement clears a meaningful floor, and only when at least one distinctive token is shared with the scanned line (brand or head noun) — shared generic words like keg, bottle, case, ml, or the supplier's own name are not evidence.
- Lines with no plausible candidate stay **empty** — no chip, no "did you mean", just the unmatched state with Quick Add and manual search. Empty is the correct answer far more often than a bad guess.
- Non-product lines (delivery charge, discount, rounding) are recognised and never get product suggestions.


### 3. Gate the AI fallback
- The AI's answer is re-scored locally against the scanned text before it is displayed. If it fails the same distinctive-token and floor checks the local matcher uses, it is discarded and the line stays empty.
- Drop the 0.7 default: an AI answer with no stated confidence is treated as low confidence, not as a good match.
- AI suggestions are labelled as AI and always require an explicit Apply — unchanged.
- "Resolve all with AI" reports how many lines it left alone rather than filling every row.

### 4. Make the reason visible
Where a candidate exists but is held back, the chip states why in plain words: "size differs", "different brand", "close alternatives", "weak name match". No silent hiding.

### 5. Regression coverage
Extend the matching tests with the failing categories: unrelated products sharing only a supplier or a generic word, non-product charge lines, and AI answers unrelated to the line — all must yield no suggestion. Existing correct matches (Strawberry, Aus Lime, Hoegaarden) must still be suggested, with their honest percentage.

## Technical notes

- `src/utils/productFuzzyMatch.ts`: split displayed confidence from ranking score; add distinctive-token evidence requirement (drop generic/unit/supplier tokens before deciding evidence exists); raise `SUGGEST` and expose the hold-back reason; add a non-product line detector.
- `src/components/invoices/InvoiceScanner.tsx`: in `askAiToMatch`, re-score each AI result with `scoreCandidates` against the scanned text and discard it unless it passes the suggest gate; remove the 0.7 confidence default; render the confidence field rather than `score`.
- `src/components/invoices/ProductSuggestionChip.tsx`: display confidence plus hold-back reason; unchanged Apply / Change match behaviour.
- `src/components/procurement/ProcurementInvoicesTab.tsx`: same gating for manually entered lines.
- `src/test/productFuzzyMatch.test.ts`: new cases per above.

No database or edge-function changes; auto-link rules stay as they are today.
