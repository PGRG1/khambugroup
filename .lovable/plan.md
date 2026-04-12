

## Fix: Remaining Calculation Issues, Column Widths, and Text Wrapping

### Problem 1: Weight-based calculation still exists in 4 places
The `updateLine` function was fixed, but these locations still use `w ? w * price : qty * price`:

| File | Line | Context |
|------|------|---------|
| `Invoices.tsx` | 289 | Loading invoice into edit dialog |
| `Invoices.tsx` | 325 | Saving edited invoice |
| `Invoices.tsx` | 1255-1258 | Create invoice subtotal display |
| `InvoiceScanner.tsx` | 661 | Saving scanned invoice |

### Problem 2: Text wrapping doesn't work
`whitespace-normal break-words` is on the `<td>`, but the `<Input>` inside is a single-line element — it can never wrap. For read-only name fields (Internal Name), replace the `<Input>` with a plain `<div>` styled to look similar, allowing text to wrap naturally.

### Changes

**`src/pages/Invoices.tsx`**:
1. Line 288-289: Remove weight variable, change total to `(qty * price) - disc + tax`
2. Line 324-325: Same fix in `handleEditSave`
3. Lines 1254-1258: Remove weight from create invoice subtotal, use `qty * price`
4. Lines 1064-1065 (edit table): Replace `<Input>` for Internal Name with a `<div>` that has `whitespace-normal break-words text-xs min-h-[32px] px-2 py-1.5 bg-muted/50 rounded-md border` so long names wrap
5. Same for External Name cell if it's read-only

**`src/components/invoices/InvoiceScanner.tsx`**:
1. Line 660-661: Remove weight variable, change `lineTotal` to `(qty * price) - disc + tax`
2. Lines 1101-1108 (scanner table): Replace `<Input>` for Internal Name with a wrapping `<div>` styled as above

### Files Changed
- `src/pages/Invoices.tsx` — 4 calculation fixes + 1 UI fix
- `src/components/invoices/InvoiceScanner.tsx` — 1 calculation fix + 1 UI fix

