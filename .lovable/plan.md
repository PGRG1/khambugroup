# Override Blocking Issues

Let users force-approve an invoice even when the AI Reviewer flagged blocking issues, without having to use "Save Draft" as a workaround.

## UX

In the footer of the Scan Invoice modal, when `hasBlockingIssues` is true, the primary button currently reads **"Resolve N Blocking"** and is disabled. Change to:

- Keep the disabled `Resolve N Blocking` button as the default state.
- Next to it, add a small **"Override & Approve"** secondary button (ghost/outline, destructive text color) with a `ShieldAlert` icon.
- Clicking it opens a confirm dialog:
  - Title: *Override blocking issues?*
  - Body: lists the blocking messages (header + per-line, prefixed with line #) and a required reason textarea ("Why are you overriding?").
  - Buttons: Cancel / Confirm Override (destructive variant, disabled until reason ≥ 5 chars).
- On confirm: store the reason + a flag on the invoice, then run the normal save path, bypassing the `hasBlockingForSave` guard.

The same affordance is added to the per-line **Details** drawer (`InvoiceReviewPanels`) so a user can clear a single line's blocking flags inline — clearing all blocking on the invoice re-enables the normal Approve & Save flow without needing the override dialog.

## Technical changes (single file: `src/components/invoices/InvoiceScanner.tsx`)

1. Extend `ScannedInvoice` with `blocking_override?: { reason: string; at: string; by_user: boolean }`.
2. New handler `handleOverrideAndSave(reason: string)`:
   - Sets `blocking_override` on `current`.
   - Calls `doSaveCurrent` directly, skipping the `hasBlockingForSave` check (factor the guard out of `handleSaveCurrent` or pass a `force` flag).
3. Append override metadata to the invoice `notes` field on save: `\n[Override] ${reason} — ${user.email} @ ${timestamp}` so it's persisted to the DB without a schema change.
4. New `<OverrideBlockingDialog>` component (inline in same file or sibling): collects the reason, shows the blocking list.
5. Footer button group: add `Override & Approve` button gated by `hasBlockingIssues && !current.is_duplicate && !hasUnmatchedItems` (unmatched items still block — they're a data-integrity issue, not a reviewer opinion).
6. Per-line drawer (`InvoiceReviewPanels.tsx`): add a "Dismiss blocking on this line" link that clears `line.review_blocking` after a confirm.

## Out of scope

- No DB migration (override is captured in `notes`; can be promoted to a dedicated column later if needed).
- No audit-log table wiring (existing `notes` line is sufficient for now; can add later).
- Reviewer logic itself is untouched — this is purely a human-override escape hatch.

## Files

- `src/components/invoices/InvoiceScanner.tsx` — button, dialog, handler, type extension.
- `src/components/invoices/InvoiceReviewPanels.tsx` — per-line dismiss action.
