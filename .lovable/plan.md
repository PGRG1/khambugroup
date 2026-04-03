

## Add Line-Level & Invoice-Level Discount to Invoice Scanner

### Current state
- The `invoice_line_items` table already has a `discount` column, and the scanner already stores/calculates with it internally — but **the column is hidden from the UI table**.
- The `invoices` table has **no discount column** — invoice-level discount needs a new DB column.

### Changes

**1. Database migration: add `discount` column to `invoices` table**
- `ALTER TABLE public.invoices ADD COLUMN discount numeric DEFAULT 0 NOT NULL;`
- This stores the invoice-level discount ($ value).

**2. `src/components/invoices/InvoiceScanner.tsx`**

- **Add "Discount" column** to the line items table between "Purch. Cost" and "Total" — an editable `<Input type="number">` bound to `line.discount`. The field already exists in the data model (`ScannedLineItem.discount`) and the calculation logic (`calcLineTotal`) already subtracts it — it's just not rendered.

- **Add invoice-level discount field** below the line items table, next to the totals row. A labeled `<Input>` for invoice-level discount ($). Store in a new `ScannedInvoice` field `invoice_discount: string`.

- **Update totals display**: `displayTotal = lineItemsTotal - invoiceDiscount`. Show breakdown: `Subtotal: X | Discount: -Y | Total: Z`.

- **Update `doSaveCurrent`**: Pass the invoice-level discount to `onSave` so it gets saved to the `invoices.discount` column.

**3. `src/hooks/useInvoiceData.ts`**
- Update `createInvoice` to accept and persist the `discount` field on the invoice record.
- Update `Invoice` interface to include `discount: number`.

### Layout change (line items table)
```text
... | Purch. Cost | Discount | Total | 🗑
```

### Invoice-level discount (below line items)
```text
Subtotal: 5,164.00    Discount: [___0.00___]    Total: 5,164.00    Doc total: $3,614.80
```

### Files
1. DB migration (1 column)
2. `src/components/invoices/InvoiceScanner.tsx` — show discount column + invoice discount input
3. `src/hooks/useInvoiceData.ts` — update interface and save logic

