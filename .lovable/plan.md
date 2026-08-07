# "Did you mean?" fuzzy product matching on scanned invoice lines

Today a scanned line only links to the Product Master on an exact SKU or exact/contains name match. Anything slightly different ("Strawberry" vs "Strawberries (250G)", "Aus Lime" vs "Lime (Australia)") falls through and the row shows no data at all. This adds a scored near-match layer with a suggestion UI.

## Behaviour

For every line that fails exact matching:

1. Score every Product Master entry against the line (supplier-scoped entries first, then global).
2. Act on the best score:
   - **>= 92%** — auto-link silently, exactly as an exact match, but tag the row as "auto-matched" so the user can see and undo it.
   - **60–92%** — leave the row unmatched but show an inline suggestion: `Did you mean Strawberry (250G) — 84%?` with an Apply button and a chevron to see the next 2–3 candidates.
   - **< 60%** — no local suggestion; fall back to AI (below).
3. AI fallback: when no candidate clears 60%, or the top two candidates are within 3 points of each other (ambiguous), ask the AI to pick from the top ~15 shortlisted candidates. It returns a chosen entry, a confidence and a one-line reason, rendered as the same suggestion chip labelled "AI". Runs on demand per row (an "Ask AI" link), plus a "Resolve all with AI" button in the review header that batches every remaining unmatched row into one call.
4. Applying a suggestion links the line the same way a manual autocomplete pick does (internal SKU, names, UOMs, ratio, master price) — no new save path.

Nothing auto-links from AI without the user pressing Apply.

## Scoring

Combined score over the line's description vs the entry's supplier name and internal name (best of the two), plus a SKU component when the line has an item code:

- Normalised text (lowercase, strip punctuation, collapse whitespace, keep CJK).
- Token overlap (Dice coefficient on word sets) — handles reordering and extra size/pack suffixes.
- Character trigram similarity — handles typos and singular/plural.
- Small bonuses: prefix match, same supplier, numeric size token match (125G vs 125g).
- Supplier-scoped candidates get a fixed boost so a same-supplier 80% wins over another supplier's 85%.

Thresholds live in one constants block so they can be tuned.

## Technical notes

- New `src/utils/productFuzzyMatch.ts`: `scoreCandidates(line, products, supplierName)` returning ranked `{ entry, score, reasons }`. Pure and unit-testable; a vitest file covers the example pairs above.
- `src/utils/productMasterResolver.ts` is left as the exact-match authority — the fuzzy layer is called only after it returns null, so existing save-time behaviour is unchanged.
- `src/components/invoices/InvoiceScanner.tsx`: in `flagLineItemIssues`, when `resolveExactMatch` returns null, run `scoreCandidates` and store `suggestions` on the line (top 3) or auto-link at >= 92% with `auto_matched: true`. Lines the AI reviewer explicitly flagged `needs_review`/`new_item` keep their current behaviour but still get suggestions shown (never auto-linked).
- New `SuggestionChip` rendered inside the unmatched row in the line-items table (same pattern as the existing blocking-issue chips), reusing `ProductAutocomplete`'s select handler for Apply.
- AI fallback goes through the existing `ai-classify` edge function with `domain: "procurement"`, `workflow: "product_match"`, passing the line and the shortlisted candidates; `useAiSuggestion` + `AiSuggestionPanel` already provide the Accept Once / Accept & Teach loop, so an accepted AI match can teach a rule keyed on supplier + external name.
- Same fuzzy layer wired into `src/components/procurement/ProcurementInvoicesTab.tsx` so manually entered invoice lines get identical suggestions.
