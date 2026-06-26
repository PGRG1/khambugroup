Modify only `src/pages/procurement/SupplierAccount.tsx`.

## 1. Types & badge config

- Extend `LedgerType` union with `"opening_balance"`.
- Add to `TYPE_CONFIG`:
  `opening_balance: { label: "Opening bal", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" }`.

## 2. State + data fetch

- Add `const [openingBalances, setOpeningBalances] = useState<any[]>([]);`
- Add `const [openingDeposits, setOpeningDeposits] = useState<any[]>([]);`
- Inside the existing `useEffect` (the `tenantId && supplierId` loader), after the current queries, fetch in parallel:
  - `supplier_opening_balances` where `supplier_id = supplierId` and `tenant_id = tenantId` → `setOpeningBalances(...)`.
  - `deposit_opening_balances` where `supplier_id = supplierId` and `tenant_id = tenantId` → `setOpeningDeposits(...)`.

## 3. Statement tab (ledger memo)

In the `ledger` `useMemo`, before the existing `entries.push` loops, push one entry per opening balance row:

```
{
  id: `ob-${row.id}`,
  date: row.as_of_date,
  type: "opening_balance",
  reference: "Opening balance",
  description: row.notes?.trim() || `Opening balance as of ${fmtDate(row.as_of_date)}`,
  venue: row.venue || "",
  debit: Number(row.amount) || 0,
  credit: 0,
}
```

Change the sort so opening_balance entries always come first regardless of date:

```
entries.sort((a, b) => {
  if (a.type === "opening_balance" && b.type !== "opening_balance") return -1;
  if (b.type === "opening_balance" && a.type !== "opening_balance") return 1;
  return (a.date || "").localeCompare(b.date || "");
});
```

Add `openingBalances` to the memo dependency array. Opening balances flow through the existing running-balance and CSV export logic unchanged.

## 4. Deposits tab

Locate the deposits table render (built from `depositLines`). Build a combined array:

- Invoice-line deposits: existing mapping (Date = `invoices.invoice_date`, Invoice # = `invoices.invoice_number`, Charged / Returned split by sign of `total`, Net = Charged − Returned, Status = current badge).
- Opening deposits from `openingDeposits`: Date = `as_of_date`, Invoice # = `"Opening"`, Description = `description`, Charged = `Number(total_value) || 0`, Returned = `0`, Net Outstanding = Charged, Status = `<Badge>` with gray styling (`bg-zinc-500/15 text-zinc-300 border-zinc-500/30`) labelled `"Opening"`.

Concatenate then sort by date ascending. Update the totals row to sum Charged / Returned / Net across the combined array so opening deposits are included.

No other tab, query, or file changes.
