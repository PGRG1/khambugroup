# Make Card Tips negative everywhere (mirror Discount)

## The break in logic

Today, `discount` and `cardTips` are treated inconsistently:

| Field      | AI scan output | Scanner UI shown as | Stored in DB | Journal logic                              |
|------------|----------------|---------------------|--------------|--------------------------------------------|
| Discount   | positive       | positive (auto‑flipped on save) | **negative** | `ABS(discount)` debited to discount account |
| Card Tips  | positive       | positive            | **positive** | positive credited to `tips_payable`         |

This asymmetry is exactly the "creak" you're seeing. As soon as anyone manually enters tips as a negative number (matching the discount convention), every downstream calculation breaks:

- `getPaymentTotal` does `sum(payments) − tips` → if tips is negative, it ADDS the tip back instead of subtracting, throwing off the payment‑vs‑sales reconciliation.
- The SQL `rebuild_journal_from_operations` does `IF r.tips > 0 THEN credit tips_payable` → a negative tip silently produces zero credit, so debits and credits no longer balance and the suspense account absorbs the gap. Trial balance rows get distorted.

## The fix — treat tips exactly like discount

**One rule:** card tips are a deduction from gross card receipts (the cash owed to staff), so store them as a **negative** number, just like discount.

### Frontend changes

1. **`src/components/dashboard/ReceiptScanner.tsx`**
   - On AI extraction (line ~145): `cardTips: -Math.abs(Number(raw.cardTips) || 0)` (mirror what we already do for discount on line 134).
   - In `handleFieldChange`: when user edits `cardTips`, force the stored value negative (same pattern as discount). UI input shows the absolute value; internal state holds the negative.
   - Display the Card Tips input with a destructive‑colored label and `−` prefix in the summary line, matching Discount.
   - Update `getPaymentTotal` callers / mismatch warning text from "− card tips" to "+ card tips" since tips are now already negative.

2. **`src/components/dashboard/ManualInput.tsx`**
   - Change the "Card Tips" field label to "Card Tips (enter as positive)" mirroring Discount.
   - In `handleSubmit`, normalize: `cardTips: -Math.abs(form.cardTips)` before calling `onAdd`.
   - Display tips as `−|cardTips|` in any summary text.

3. **`src/utils/salesUtils.ts`**
   - `getPaymentTotal`: change from `… + cash − tips` to `… + cash + tips` (because tips are now stored negative, adding them performs the deduction).
   - `SalesRecordSchema`: change `cardTips` validation from `min(0)` to `min(-100000000).max(0)` (or `.max(100000000)` if we want to allow either sign during transition, but strict ≤0 is cleaner).
   - `parseExcelRow`: replace `parsePositive(row[19])` with `-Math.abs(parseNum(row[19]))` so spreadsheet imports follow the same convention.

4. **`src/hooks/useSalesData.ts`**
   - In `toDbRecord`: enforce `card_tips: -Math.abs(r.cardTips)` (mirrors the existing discount line).
   - In `fromDbRecord` + a new `normalizeCardTips` helper (parallel to `normalizeDiscount`): coerce DB value to negative on read, so any legacy positive rows display correctly without requiring a data backfill.

### Edge function

5. **`supabase/functions/parse-receipt/index.ts`**
   - Add a system‑prompt rule: "`cardTips` and `discount` must both be returned as **negative** numbers (they reduce total sales / are owed to staff)." This makes the AI output match the new convention from the source. The frontend `-Math.abs(...)` is still kept as a safety net.

### Database / journal logic

6. **`rebuild_journal_from_operations` SQL function** (migration)
   - Replace `IF r.tips > 0 THEN ... credit acc_tips ... r.tips` with `IF ABS(r.tips) > 0 THEN ... credit acc_tips, ABS(r.tips)`. Same pattern already used for discount (`ABS(r.discount)`).
   - This makes the journal entry produce the correct credit regardless of whether the stored tip is positive (legacy rows) or negative (new convention), restoring the trial balance.

### Optional one‑time data normalization

7. A small UPDATE migration to flip any existing positive `card_tips` rows to negative:
   ```sql
   UPDATE public.sales_records SET card_tips = -ABS(card_tips) WHERE card_tips > 0;
   ```
   Then re‑run `rebuild_journal_from_operations()` so the journal/trial balance reflects the cleaned data.

## Result

- Card Tips and Discount behave identically end‑to‑end: shown as negative in the data table and PDF reports, entered as a positive convenience value in input forms, stored negative, scanned negative.
- `getPaymentTotal` and the SQL journal rebuild both use `ABS(...)` semantics, so the trial balance always balances regardless of sign drift.
- Existing positive tip rows are migrated and the journal is rebuilt, so the trial balance imbalance you've been seeing is resolved.

## Files touched

- `src/components/dashboard/ReceiptScanner.tsx`
- `src/components/dashboard/ManualInput.tsx`
- `src/utils/salesUtils.ts`
- `src/hooks/useSalesData.ts`
- `supabase/functions/parse-receipt/index.ts`
- New migration: update `rebuild_journal_from_operations` + normalize existing `card_tips` data
