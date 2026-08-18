# BaniProcessingMark — full render audit (no changes made)

## Inventory

| # | File : line | UI context | Class | Size | Parent layout classes | Alignment / optics |
|---|---|---|---|---|---|---|
| 1 | `src/pages/Assistant.tsx:178` | Chat "thinking" bubble before first token | chat response | 24 | `div.flex.gap-3` > `div.pt-1`; avatar is `h-7 w-7` | Horiz OK. Mark is 24px tall vs 28px avatar and `pt-1` pushes it down — sits ~4px low relative to avatar centre |
| 2 | `src/pages/Assistant.tsx:204` | Send button while streaming | normal button (`size="icon"`, h-12 w-12) | 18 | Button `inline-flex items-center justify-center gap-2` | Centred; but mark width is only ~9.6px (aspect 320:600) so it reads visually smaller/thinner than the 16px `Send` icon it replaces |
| 3 | `src/components/ai/AiSuggestionPanel.tsx:40` | "Ask AI" button | normal button (`size="sm"`, h-9) | 18 | Button gap-2 | Swapping text "Ask AI" for an 18px mark collapses button width → panel header jumps on click |
| 4 | `src/components/bank/recon/TransactionReviewPanel.tsx:242` | "Suggest with AI" | full-width button (`w-full`) | 18 | `Button.w-full` (gap-2) + literal space before `{aiBusy ? "Thinking…"}` | Mark + text separated by both `gap-2` **and** a JSX text space → inconsistent ~12px gap vs the 8px used elsewhere. Idle icon is `h-3 w-3`, busy mark is 18px → button content height jumps |
| 5 | `src/components/finance/bank-recon/TransactionReviewPanel.tsx:331` | Same, duplicated file (unrouted) | full-width button | 18 | identical | Same defects |
| 6 | `src/components/bank/recon/StatementUploadFlow.tsx:261` | "Extract" in DialogFooter | normal button | 18 | Button gap-2 | OK horizontally; mark (18) taller than the 16px `Upload` idle icon → footer button shifts height slightly |
| 7 | `src/components/finance/bank-recon/StatementUploadFlow.tsx:257` | Same, duplicated (unrouted) | normal button | 18 | identical | Same |
| 8 | `src/components/petty-cash/PettyCashImport.tsx:465` | "Extracting…" in DialogFooter | normal button | 18 | Button `gap-2` + `className="mr-2"` on mark | **Duplicated spacing**: gap-2 + mr-2 = 16px gap, vs 8px in idle state |
| 9 | `src/components/staff-reimbursements/ReimbursementAiImport.tsx:446` | "Extracting…" footer | normal button | 18 | gap-2 + `mr-2` | Same duplicated spacing |
| 10 | `src/components/hr/PayrollImportDialog.tsx:398` | "Extract with AI" footer | normal button | 18 | gap-2 + `mr-2` | Same duplicated spacing |
| 11 | `src/components/finance/bills/BillScanner.tsx:249` | "Scan & Extract" footer | normal button | 18 | gap-2 + `mr-2`, no space before "Scanning…" | Duplicated spacing; **component is dead code** (only its `ScannedBill` type is imported) |
| 12 | `src/components/finance/payments/AiMatchModal.tsx:140` | "Run AI Match" | normal button | 18 | gap-2 + `mr-2` | Duplicated spacing |
| 13 | `src/components/finance/payments/AiMatchModal.tsx:239` | "Re-run" (footer) | normal button | 18 | gap-2 + `mr-2` | Duplicated spacing; sits next to an `Apply` button that still uses `Loader2` (correct — transactional) |
| 14 | `src/components/finance/payments/ParseSettlementModal.tsx:308` | "Parsing & auditing statement…" | full-panel/modal | 24 | `div.flex.items-center.gap-2.py-10.justify-center` inside `div.flex-1.overflow-auto` of an `max-w-6xl max-h-[88vh]` dialog | Horizontally centred, **not vertically centred in the tall dialog body** — `py-10` pins it to the top of a ~700px scroll area |
| 15 | `src/components/finance/bills/BillDropZone.tsx:167` | Inline "Scan Bill" card, scanning state | full-panel | 24 | `div.flex.flex-col.items-center.justify-center.py-12` directly under the heading row | Centred only in its own `py-12` strip → visually sits high/low relative to the card, and the card collapses in height vs the dropzone state (layout jump) |
| 16 | `src/components/dashboard/ReceiptScanner.tsx:327` | `card-glass` scanner panel, scanning | full-panel | 24 | same `py-12` block under `h3` heading row | Same: centred below the heading, not in the whole card; card shrinks dramatically from the `p-10` dropzone height |
| 17 | `src/components/invoices/InvoiceScanner.tsx:2026` | Invoice OCR scanning | full-panel | 24 | `div.flex.flex-col.items-center.gap-3.py-12` + optional `Progress w-48` | Best of the three (has `gap-3`), but same "below the heading" issue and same collapse-in-height jump |
| 18 | `src/components/invoices/InvoiceScanner.tsx:2245` | "Resolve N unmatched with AI" | normal button (`size="sm"`) | 18 | gap-2 + `mr-1` | **Inconsistent**: `mr-1` here vs `mr-2` everywhere else; total gap 12px |
| 19 | `src/components/invoices/ai/BaniScanSummary.tsx:60` | "Re-run" Bani scan | normal button (ghost, `h-7 gap-1.5`) | 18 | `h-7` button, `gap-1.5` | 18px mark inside a 28px-tall button with 6px gap — tightest instance; mark nearly fills button height |
| 20 | `src/components/invoices/ProductSuggestionChip.tsx:71` | "Ask AI to match" link chip | inline chip | 14 | `inline-flex items-center gap-1 text-[11px]` | Good; 14px mark ≈ 7.5px wide vs 12px `Sparkles` → text reflows horizontally when toggling |
| 21 | `src/components/invoices/ProductSuggestionChip.tsx:118` | "Ask AI" inline chip | inline chip | 14 | same | Same reflow |

## Cross-cutting defects

1. **Aspect-ratio mismatch (systemic).** `BaniProcessingMark` renders `width = size * 320/600` (0.53×). At `size={18}` it is 18×9.6px, replacing 16×16 lucide icons. Every icon↔mark swap therefore changes both button width and content height.
2. **Button `[&_svg]:size-4` collision.** `buttonVariants` applies `[&_svg]:size-4` to *any* descendant SVG; the mark's inner `<svg className="h-full w-full">` is same-specificity, so the rendered size depends on stylesheet order — the mark can be silently forced to 16×16 inside buttons.
3. **Duplicated spacing (`gap-2` + `mr-*`).** Items 8–13, 18: `Button` already sets `gap-2`, so `mr-2`/`mr-1` doubles the gap and makes the busy state wider than the idle state. Items 4/5 add a literal JSX space instead.
4. **Large panels centred only under the heading.** Items 14, 15, 16, 17 use a `py-10`/`py-12` strip rather than filling the card/modal body (`min-h`, `flex-1`, `items-center justify-center`), so the mark sits too low/high and the container jumps height when entering the scanning state.
5. **Size vocabulary drift.** 14 / 18 / 24 used, but `h-7` (BaniScanSummary) and `h-9` (`sm`) buttons both get 18 — the mark is oversized in `h-7`.
6. **Mobile.** All full-panel instances are width-safe; the `w-full` recon button (4/5) and the `justify-end` footer buttons are fine. The chat bubble (1) is the only one with avatar-baseline drift on small screens.

## Duplicated components / routes needing the same treatment

- `src/components/bank/recon/*` vs `src/components/finance/bank-recon/*` — six mirrored files. Only `bank/recon` is routed (`/bank/reconciliation`); `src/pages/finance/BankReconciliation.tsx` is **not registered in `App.tsx`**. Both copies contain the mark and both drift.
- `src/components/finance/bills/BillScanner.tsx` (dialog) vs `BillDropZone.tsx` (inline, routed via `BillsExpenses.tsx`). `BillScanner` is rendered nowhere — only its `ScannedBill` type is imported.
- `PettyCashImport.tsx`, `ReimbursementAiImport.tsx`, `PayrollImportDialog.tsx` are three near-identical "Extract with AI" dialogs with the same `gap-2 + mr-2` defect.

## Remaining spinners — verdict

All 19 surviving `animate-spin` / `Loader2` instances are transactional (Saving, Applying, Committing, Creating, Add & link) or plain data loading (`PriceHistoryPanel` document/history fetch). **No generic spinner remains in a real AI/OCR/extraction/matching/thinking state.**

## Prioritized problems

1. Full-panel states (`ReceiptScanner:327`, `BillDropZone:167`, `InvoiceScanner:2026`, `ParseSettlementModal:308`) are not centred in the card/modal body and cause a height collapse.
2. `gap-2` + `mr-2`/`mr-1` double spacing across 7 button call sites.
3. Mark aspect ratio (0.53×) + Button `[&_svg]:size-4` make in-button sizing unpredictable and inconsistent with 16px lucide icons.
4. `BaniScanSummary` 18px mark inside an `h-7 gap-1.5` button is oversized.
5. Recon panel buttons (`bank/recon` + `finance/bank-recon`) mix `gap-2` with a literal text space; icon 12px vs mark 18px causes height jump.
6. Dead/unrouted duplicates (`finance/bank-recon/*`, `finance/BankReconciliation.tsx`, `bills/BillScanner.tsx`) will drift unless deleted or kept in sync.
7. Chat "thinking" mark sits ~4px below the avatar centre.
