## Goal

Two narrow additions to the invoice workflow:

1. Let users confirm an invoice **even when disputed lines exist** — GRN still uses accepted values, the disputed amount is captured on the invoice for follow-up.
2. Let users **void** an invoice that has not yet been confirmed (no GRN), with a required reason.

No changes to GRN logic, accepted price/qty logic, the parse-invoice edge function, or the scanner line-item table.

## Status mapping

Codebase uses `'approved'` as the confirmation state that triggers GRN creation. I'll treat **`approved` = confirmed** — no new "confirmed" status. Verified existing `invoices.status` values: only `disputed`, `paid`, `unpaid` exist today, all covered by the new constraint.

## 1. Database migration

```sql
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS has_disputes      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disputed_amount   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS void_reason       text,
  ADD COLUMN IF NOT EXISTS voided_at         timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by         uuid;

ALTER TABLE public.invoices DROP CONSTRAINT invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['pending','verified','approved','paid','unpaid',
                             'overdue','cancelled','disputed','voided']));
```

## 2. Dispute summary modal (Invoice Scanner + Edit Invoice)

On **Approve & Save** (`InvoiceScanner.tsx` `handleSaveCurrent` and `ProcurementInvoicesTab.tsx` edit-save):

- Disputed lines: `(price_disputed === true || accepted_qty < quantity) && !is_free_unit_line`.
- `disputed_amount = Σ (unit_price·quantity − accepted_price·accepted_qty)` (signed; negative = supplier over-billed).
- None → existing flow unchanged.
- Any → open new `DisputeConfirmDialog`:
  - Title: "Confirm with disputes?"
  - Table: Item · Inv. price · Acc. price · Inv. qty · Acc. qty · Variance, plus total row.
  - Muted note: "Cost and inventory will be posted using accepted quantities and prices. The disputed amount will be tracked for follow-up with the supplier."
  - Buttons: **Confirm anyway** (amber/primary) · **Go back**.
- On confirm-anyway: run existing approve path and additionally persist `has_disputes=true`, `disputed_amount=<computed>`. GRN path untouched.

## 3. Invoice list — dispute badge & filter

`ProcurementInvoicesTab.tsx`:

- Where `has_disputes`, render amber **Disputed** chip next to the existing status chip (status stays Approved/emerald). No new column.
- Tooltip: `Disputed: HK$ X.XX — pending credit note`.
- Add "Disputed" filter option → `status='approved' AND has_disputes=true`.

## 4. Void flow

Eligibility: `status NOT IN ('approved','paid','voided','cancelled')` — before any GRN exists.

- Add **Void invoice** to the existing row action menu and to the scanner/editor action area when eligible.
- `VoidInvoiceDialog`:
  - Required reason textarea (placeholder: `e.g. Supplier sending corrected invoice`).
  - Muted-red warning: "This cannot be undone. No GRN will be created for this invoice."
  - **Void invoice** (destructive, disabled until reason non-empty) · **Cancel**.
- On confirm: `status='voided'`, `void_reason`, `voided_at=now()`, `voided_by=auth.uid()`. No GRN side-effects.

List behaviour:

- Voided rows: grey "Voided" chip, row text at reduced opacity.
- Hidden by default; **Show voided** toggle in the filter bar surfaces them.
- When shown, row is read-only (view only).

## 5. Files touched

- New migration — section 1.
- `src/components/invoices/InvoiceScanner.tsx` — dispute detection + modal trigger on confirm; persist `has_disputes`/`disputed_amount`.
- `src/components/invoices/DisputeConfirmDialog.tsx` — new.
- `src/components/invoices/VoidInvoiceDialog.tsx` — new.
- `src/components/procurement/ProcurementInvoicesTab.tsx` — same dispute trigger in edit-save, list badge + tooltip, filter additions, void menu item, voided-row styling, "Show voided" toggle.
- `src/hooks/useInvoiceData.ts` — extend `Invoice` interface with the new fields and allow them through `updateInvoice`.

## Out of scope

- No changes to GRN creation, accepted price/qty math, scanner line-item columns, or the parse-invoice edge function.
- No automatic credit-note creation from disputed amounts.
- No GRN reversal — void is pre-confirmation only.
