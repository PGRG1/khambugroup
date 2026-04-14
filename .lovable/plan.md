

## Fix: Remove `$` sign from non-monetary fields in Sales Record modal

**Problem**: In the Sales Record detail modal, the `Row` component formats ALL numeric values with a `$` prefix (line 95 of `SalesDetailModal.tsx`). This incorrectly shows `$38` for Orders and `$89` for Guests, which are counts, not currency.

**Solution**: Add a `isCurrency` flag to the `Row` component. Only prepend `$` and format as currency when the field is monetary.

**File**: `src/components/dashboard/SalesDetailModal.tsx`

1. Update the `Row` component to accept an optional `isCurrency` prop (default `true` for backward compatibility).
2. When `isCurrency` is `false`, display the number without `$` and without currency formatting (just use `toLocaleString()` for clean number display).
3. Update the `Row` calls for **Orders** and **Guests** to pass `isCurrency={false}`.

**Fields affected**:
- Orders → plain number
- Guests → plain number
- All other numeric fields (Subtotal, Service Charge, Discount, Total Sales, payment methods) → keep `$` formatting

