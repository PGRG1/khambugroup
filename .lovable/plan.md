## Goal

Redesign the **Invoice Scanner review screen** (the panel shown after a scan, inside `src/components/invoices/InvoiceScanner.tsx`) using the uploaded mockup as a structural reference. Keep the existing deep-zinc dark theme, fonts, and chip system — no color rework, no new tables, no procurement-module redesign.

All data needed already exists on each scanned invoice: `review_corrections`, `review_warnings`, `review_blocking`, `review_status` per line, header check flags, matched / new-item counts, and Agent 2 reasoning per row.

## What the new review screen looks like

```text
┌─ Workflow strip ──────────────────────────────────────────────────────────┐
│ ✓ Extractor  →  ✓ Reviewer  →  ◐ Human Approval (Pending)                 │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Check cards (4 across) ──────────────────────────────────────────────────┐
│ Header Check │ Supplier Check │ Math Check │ Item Mapping                 │
│ Passed       │ Passed         │ 1 Warning  │ 12 Matched · 2 New · 1 Block │
└───────────────────────────────────────────────────────────────────────────┘

┌─ KPI strip (compact) ─────────────────────────────────────────────────────┐
│ Total Items 16 │ Matched 12 │ Auto-corr 4 │ Warnings 2 │ Blocking 1 │ New 2│
└───────────────────────────────────────────────────────────────────────────┘

┌─ Summary banner ──────────────────────────────────────────────────────────┐
│ ⓘ 4 auto-corrections · 2 warnings · 1 blocking · 12 matched · 2 new  ⌄  │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Header fields (inline correction chips under each input) ────────────────┐
│ Supplier ▾   Invoice #   Invoice Date   Venue   …   Subtotal  Tax  Total  │
│ [Auto-corrected]  [Auto-corrected]  [Auto-corrected]                      │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Line items table ────────────────────────────────────────────────────────┐
│ # · Internal SKU · Internal Name · Ext SKU · Ext Name · UOM · Qty · Cost  │
│ · Disc · Total · Status · Action                                          │
│  …rows… Status chip = Matched / Auto-corrected / Price Warning / New /    │
│  Blocking. Action = [Details] or [Add Item] or [Resolve].                 │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Footer ──────────────────────────────────────────────────────────────────┐
│ ← Back            Save Draft       Approve & Save (disabled if blocking)  │
└───────────────────────────────────────────────────────────────────────────┘

Side drawer (opens when [Details] / [Resolve] / [Add Item] clicked):
┌─ Line N  [Status chip]                                              ✕ ──┐
│ Tabs: Review · History                                                  │
│ Issue            – plain-English summary                                │
│ Agent 2 reco     – correction suggestion                               │
│ Extracted vals   – original AI extraction (read-only)                  │
│ Reason           – Agent 2 explanation                                 │
│ Confidence       – progress bar + %                                     │
│ Action required  – [Add Item] / [Accept correction] / [Resolve]        │
└───────────────────────────────────────────────────────────────────────┘
```

## Build plan

1. **Add small presentational subcomponents** inside `src/components/invoices/InvoiceScanner.tsx` (or a sibling file `InvoiceReviewPanels.tsx` to keep the main file shorter):
   - `WorkflowStrip` — three pill steps with icon + status.
   - `CheckCard` — icon, title, status line; variant by passed / warn / block.
   - `KpiStrip` — compact horizontal counters.
   - `ReviewDrawer` — right-side sheet showing per-line Agent 2 detail (uses existing shadcn `Sheet`).
   - `CorrectionChip` — small "Auto-corrected" / "Warning" / "Blocking" chip rendered under a header input.
   All built with existing semantic tokens (`bg-card`, `border-border`, `chip-success/warn/danger/info/neutral`, `text-muted-foreground`, etc.) and Tailwind primitives — no hardcoded colors.

2. **Reorganize the review section** (lines ~1200–1700 of `InvoiceScanner.tsx`):
   - Replace the stack of full-width warning banners with the four `CheckCard`s plus one `KpiStrip` plus the existing "Invoice Review: …" summary, collapsed into a single info banner with a "View review summary" disclosure.
   - Move per-field Agent 2 corrections from the modal-only view to **small chips directly under each header input**, so users see what changed without opening a dialog.
   - Keep the existing supplier dropdown, venue select, invoice #, date, due date, totals, discount, and notes fields exactly as they are functionally.

3. **Line-items table** — keep current columns and editing behavior; add:
   - A clean **Status** column rendering one chip per row (Matched, Auto-corrected, Price Warning, New Item, Blocking Issue) driven by existing `review_status` / `review_warnings` / `review_blocking` fields.
   - A single **Action** column: `Details` (default), `Add Item` (when `review_status === "new_item"`), `Resolve` (when row has blocking issues). Clicking opens the new `ReviewDrawer` for that row.
   - Remove the inline expandable warning/blocking rows that currently bloat the table — that content lives in the drawer now.

4. **Footer actions** — keep current logic, restyle:
   - `Save Draft` (secondary) — saves with `status = 'draft'`.
   - `Approve & Save` (primary) — disabled when blocking issues exist or invoice is duplicate; tooltip explains why. Both buttons reuse the existing save flow in `doSaveCurrent`.

5. **Workflow strip** — top-right. Extractor done = success; Reviewer done if Agent 2 returned; Human Approval = pending until user approves. Pure presentational, no new state.

6. **No backend / Edge Function changes.** No schema changes. No changes to `useInvoiceData`, `parse-invoice`, save flow, item creation flow, or Items Master matching.

## Out of scope

- Light theme (project is dark zinc — mockup colors are reference only).
- The `Invoices Database` list at the bottom of the mockup (already lives on `/procurement/invoices`).
- Sidebar / page chrome.
- Any change to AI prompts or Agent 2 behavior.

## Files touched

- `src/components/invoices/InvoiceScanner.tsx` — restructure the review section, add subcomponents (or split into a new sibling file).
- Possibly `src/components/invoices/InvoiceReviewPanels.tsx` (new) — only if the main file would grow too long.

## Open question before I build

The mockup also shows compact KPI cards labeled `Total Items / Matched / Auto-corrected / Warnings / Blocking / New`. Do you want these as a **second row** in addition to the four Check cards (Header / Supplier / Math / Item Mapping), or **merged into one row** of mixed status + counter cards? I'll default to **two rows** (Check cards on top, KPI strip below) unless you say otherwise.
