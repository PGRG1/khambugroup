

## Fix: Widen All Narrow Numeric Columns in Invoice Scanner

### Problem
Multiple numeric columns (Purch. Qty, Stock Qty, Purch. Cost, Discount, Total) have narrow widths that crop decimal values.

### Changes

**`src/components/invoices/InvoiceScanner.tsx`** — Widen all numeric column headers and their inputs:

| Column | Current | New |
|--------|---------|-----|
| Purch. Qty | `w-[60px]` | `w-[85px]` |
| Stock Qty | `w-[65px]` | `w-[85px]` |
| Purch. Cost | `w-[85px]` | `w-[95px]` |
| Discount | `w-[70px]` | `w-[85px]` |
| Total | `w-[80px]` | `w-[90px]` |

Also add `min-w-[75px]` to the corresponding `<Input>` fields for Purch. Qty, Stock Qty, Purch. Cost, and Discount to prevent input text from being cropped.

Increase the table `min-w` from `1200px` to `1350px` to accommodate the wider columns.

**Same fixes in `src/pages/Invoices.tsx`** and **`src/components/procurement/ProcurementInvoicesTab.tsx`** if they render the same table layout.

