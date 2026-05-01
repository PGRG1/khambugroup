## Goal

Make recorded Journal entries editable from the Journal page (`/finance/journal`). Currently only manual entries can be voided, and nothing can be edited after posting — including manual entries. Auto-generated entries (from sales/invoices/payroll) get wiped and re-created on every "Rebuild", so they need a different treatment than manual ones.

## Approach

Two distinct edit behaviors based on the entry's `source_type`:

**1. Manual entries** — fully editable
- Edit date, memo, and all lines (account, debit, credit, memo, venue)
- Add or remove lines
- Must remain balanced (debits = credits, ≥ 2 lines) — enforced by existing `check_journal_balance` trigger
- Save updates the entry in place (no void + recreate)

**2. Auto-generated entries** (sales, invoice, invoice_payment, payroll_accrual, payroll_payment, mpf_payment) — *protected* edit
- Editing is allowed but flagged: any change marks the entry as `manually_adjusted = true` so the next "Rebuild from operations" will **not** wipe it
- Show a warning in the edit dialog explaining that the entry will be detached from its source
- Same balanced-debits/credits rule applies
- User can also click "Restore to auto-generated" to clear the flag and let the next rebuild replace it

## UI Changes

In `src/pages/finance/Journal.tsx`:
- Add a pencil (Edit) icon button on each row, next to the existing Void button, for **all** posted, non-void entries
- Replace the current `NewEntryDialog` with a shared `EntryEditorDialog` that handles both create and edit modes
- In edit mode, prefill the dialog with the entry header (date, memo) and all existing lines
- Show a yellow banner inside the dialog when editing a non-manual entry: *"This entry was auto-generated from {source}. Saving will detach it from automatic rebuilds."*
- Add a small "auto-detached" badge next to entries where `manually_adjusted = true`

## Backend Changes

**Migration** (schema only):
- Add column `journal_entries.manually_adjusted boolean not null default false`
- Update `rebuild_journal_from_operations` to **skip deletion** of any entry where `manually_adjusted = true` (currently it deletes everything where `source_type <> 'manual'`)
- Add audit-log event `journal_entry_edited` recorded on every save

**`useJournal.ts` hook**:
- Add `updateEntry(id, { entry_date, memo, lines })` that:
  1. Validates ≥ 2 lines and balanced debits/credits client-side
  2. Updates `journal_entries` row (date, memo, sets `manually_adjusted = true` if source_type ≠ 'manual')
  3. Deletes existing `journal_lines` for that entry and re-inserts the new lines
  4. The DB trigger `check_journal_balance` enforces balance server-side
  5. Writes a row to `ledger_audit_log` with event `journal_entry_edited`
- Add `restoreAutoEntry(id)` that sets `manually_adjusted = false` (next rebuild will recreate)

## Permissions

Editing requires the same admin/manager access that already gates the Journal page — no new permission keys needed.

## Files Touched

- `supabase/migrations/<new>.sql` — add column + update rebuild function
- `src/hooks/useJournal.ts` — add `updateEntry`, `restoreAutoEntry`, expose `manually_adjusted`
- `src/pages/finance/Journal.tsx` — extract editor dialog, add Edit button, badge
- `src/integrations/supabase/types.ts` — auto-regenerated

## Out of scope

- Editing the **source** records (sales rows, invoices, payroll) from the Journal page — that stays in their respective modules
- Bulk edit / multi-entry operations
- Versioning / change history beyond the audit log entry