## Goal

Redesign the invoice list in `ProcurementInvoicesTab.tsx` around the new dispute lifecycle: a single Status badge, dedicated Reason / Resolution / Actions columns for disputed rows, and a four-card stat strip. Scanner, GRN logic, and the detail/edit view stay untouched.

## Live-data notes

- `invoices.has_disputes` and `invoices.disputed_amount` already exist — do **not** re-add.
- Live `invoices.status` values today are only `disputed`, `paid`, `unpaid`. `approved` and `voided` are valid per the check constraint but historically absent; UI must not assume they exist.

## 1. Migration

Add one nullable column to `invoices`:

```sql
alter table public.invoices
  add column if not exists dispute_resolution text
  check (dispute_resolution in ('credit_note','qty_received','resolved'));
```

Extend `Invoice` in `src/hooks/useInvoiceData.ts` with `dispute_resolution?: 'credit_note' | 'qty_received' | 'resolved' | null` and let `updateInvoice` pass it through.

## 2. Column structure

Replace the existing table columns in `ProcurementInvoicesTab.tsx` with exactly:

```text
Date 7% | Invoice # 14% | Supplier 17% | Venue 8% | Amount 10% (right) |
Status 10% | Reason 12% | Resolution 11% | Actions 11%
```

- Remove the `Payment Status` column and the `Review Status` / `Issue / Exception` selectors.
- Amount: right-aligned `HK$ X,XXX.XX` via existing `@/utils/format`.
- Invoice # remains the click target for the detail sheet; row click stays the same.
- Voided rows render at 45% opacity and the Actions cell is a muted dash (view-only).

## 3. Status badge

Single badge derived from `inv.status`:

- `approved` → green "✓ Approved"
- `voided` → grey "⊘ Voided"
- `has_disputes` true (typically `status='disputed'`) → amber/red "⚠ Disputed"
- `paid` / `unpaid` / any other legacy value → neutral grey chip with the raw status label, so historical rows render cleanly and never crash.

No "Under Review", "Verified", "Exceptions", or "Duplicates" anywhere.

## 4. Reason column (disputed rows only)

Compute from `invoice_line_items` per invoice:

- Alongside `fetchAll`, run a single tenant-scoped `fetchAllRows("invoice_line_items", "invoice_id, price_disputed, quantity, accepted_qty, is_free_unit_line", ...)` and aggregate per `invoice_id` into `{ hasPrice, hasShortQty }`. Keyed off `has_disputes=true` invoices.
- Badge rules:
  - price only → "Price" (`bg-[#FAEEDA] text-[#633806]`)
  - qty only → "Short qty" (same amber palette)
  - both → "Price + qty" (`bg-[#FCEBEB] text-[#791F1F]`)
- Non-disputed rows → muted dash.

## 5. Resolution column (disputed rows only)

Driven by `dispute_resolution`:

- `null` → amber "HK$ X,XXX pending" using `disputed_amount`
- `credit_note` → blue "Credit note" with `FileText` icon
- `qty_received` → green "Qty received" with `Check` icon
- `resolved` → green "Resolved" with `Check` icon

Non-disputed rows → muted dash.

## 6. Actions column

- Disputed + `dispute_resolution == null`: two outline buttons inline:
  - **Mark resolved** — green outline (`border-[#3B6D11] text-[#27500A] hover:bg-[#EAF3DE]`), opens the new `MarkResolvedDialog`.
  - **Void** — default outline, opens the existing `VoidInvoiceDialog`.
- Disputed + resolution set → muted "Done".
- All other rows (including voided) → muted dash.

Both buttons `stopPropagation` so the detail sheet doesn't open.

## 7. New `MarkResolvedDialog`

New file `src/components/invoices/MarkResolvedDialog.tsx`:

- Title "Mark invoice resolved".
- Required resolution select: Credit note received → `credit_note`, Qty received from supplier → `qty_received`, Other → `resolved`.
- Optional note textarea (placeholder "e.g. Credit note CN-0041 received from Jebsen"); appended to the invoice's existing `notes` field on save with a timestamped "Dispute resolved:" prefix (no new column).
- Confirm (amber primary) calls back with `{ resolution, note }`; tab calls `updateInvoice(id, { dispute_resolution, notes })` and refreshes.
- Cancel closes with no changes.

## 8. Stat cards

Exactly four cards, replacing the existing strip:

| Card | Value | Sub-label |
| --- | --- | --- |
| Approved | count where `status='approved'` | "confirmed clean" |
| Disputed | count where `has_disputes=true` | `HK$ X,XXX pending` (sum `disputed_amount` where `dispute_resolution is null`) |
| Voided | count where `status='voided'` | "—" |
| Total value | sum of `total_amount` across all invoices | "all time" |

Remove Total Invoices, Under Review, Exceptions, Duplicates.

## 9. Filter bar

Status chips collapse to **All · Approved · Disputed · Voided**:

- All: everything (voided rows included at 45% opacity).
- Approved: `status='approved'`.
- Disputed: `has_disputes=true`.
- Voided: `status='voided'`.

Remove `reviewStatusFilter`, `exceptionNoteFilter`, and the `showVoided` toggle plus their plumbing into `InvoiceFilters`. Keep supplier/venue/month dropdowns and the search box.

## 10. Files touched

- Migration — section 1 column only.
- `src/hooks/useInvoiceData.ts` — extend `Invoice` type.
- `src/components/procurement/ProcurementInvoicesTab.tsx` — column/header rewrite, stat cards, filter chips, action wiring, dispute-summary fetch, removal of review/exception state.
- `src/components/invoices/MarkResolvedDialog.tsx` — new.

## Out of scope

- Invoice scanner (`InvoiceScanner.tsx`) untouched.
- GRN creation, accepted-price logic, edit/detail sheet behaviour untouched.
- No new pages, routes, or sidebar entries.
- `VoidInvoiceDialog` reused as-is.
- No re-adding of `has_disputes` / `disputed_amount`.
