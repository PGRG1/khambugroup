/**
 * Simplified supplier-payment logic.
 *
 * Business rules:
 * - Every recorded payment reduces the supplier running balance in full on its
 *   payment date, whether or not it is allocated to invoices.
 * - Allocation is optional and only identifies which documents are settled.
 * - "Supplier credit / advance" is only the portion that makes the account go
 *   into credit — an unallocated payment is NOT automatically an advance.
 * - Disputed invoices stay in the statement but are excluded from automatic
 *   allocation.
 */

export type AllocatableInvoice = {
  id: string;
  invoice_number?: string;
  invoice_date: string;
  due_date?: string | null;
  outstanding_amount: number;
  payment_status?: string;
  review_status?: string | null;
};

export type SuggestedAllocation = {
  invoice_id: string;
  amount: number;
};

const EPS = 0.005;

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Canonical dispute mechanism: invoices.review_status = 'Disputed'. */
export function isDisputedInvoice(inv: Pick<AllocatableInvoice, "review_status">): boolean {
  return String(inv.review_status || "").toLowerCase() === "disputed";
}

export function isVoidedInvoice(inv: Pick<AllocatableInvoice, "payment_status" | "review_status">): boolean {
  return (
    String(inv.payment_status || "").toLowerCase() === "voided" ||
    String(inv.review_status || "").toLowerCase() === "voided"
  );
}

/**
 * Eligible for automatic (FIFO) allocation: open, not voided, not disputed and
 * dated on or before the payment date.
 */
export function isAutoAllocatable(inv: AllocatableInvoice, paymentDate: string): boolean {
  if (isVoidedInvoice(inv)) return false;
  if (isDisputedInvoice(inv)) return false;
  if ((Number(inv.outstanding_amount) || 0) <= EPS) return false;
  if (!inv.invoice_date) return false;
  if (paymentDate && inv.invoice_date > paymentDate) return false;
  return true;
}

/** Oldest first by invoice date, then due date, then invoice number. */
export function sortFifo(invoices: AllocatableInvoice[]): AllocatableInvoice[] {
  return [...invoices].sort((a, b) => {
    const d = (a.invoice_date || "").localeCompare(b.invoice_date || "");
    if (d !== 0) return d;
    const due = (a.due_date || "").localeCompare(b.due_date || "");
    if (due !== 0) return due;
    return (a.invoice_number || "").localeCompare(b.invoice_number || "");
  });
}

/**
 * FIFO suggestion. Never allocates to invoices dated after the payment date,
 * skips voided / fully paid / disputed invoices, and stops when the payment is
 * exhausted. The result is a *suggestion* the user must review before saving.
 */
export function autoAllocateFifo(
  paymentAmount: number,
  invoices: AllocatableInvoice[],
  paymentDate: string,
): SuggestedAllocation[] {
  let remaining = round2(paymentAmount);
  if (remaining <= EPS) return [];
  const out: SuggestedAllocation[] = [];
  for (const inv of sortFifo(invoices.filter((i) => isAutoAllocatable(i, paymentDate)))) {
    if (remaining <= EPS) break;
    const take = round2(Math.min(remaining, Number(inv.outstanding_amount) || 0));
    if (take <= EPS) continue;
    out.push({ invoice_id: inv.id, amount: take });
    remaining = round2(remaining - take);
  }
  return out;
}

/** Net amount genuinely due on eligible (non-disputed, non-voided) invoices. */
export function eligibleNetDue(invoices: AllocatableInvoice[], paymentDate: string): number {
  return round2(
    invoices
      .filter((i) => isAutoAllocatable(i, paymentDate))
      .reduce((s, i) => s + (Number(i.outstanding_amount) || 0), 0),
  );
}

/**
 * Supplier credit / advance = only the part of a payment that pushes the
 * supplier account into credit. Unallocated money on its own is NOT an advance.
 */
export function supplierAdvanceAmount(paymentAmount: number, netDue: number): number {
  return round2(Math.max(0, (Number(paymentAmount) || 0) - (Number(netDue) || 0)));
}

/** Payment = allocated + unallocated, always. */
export function unallocatedAmount(paymentAmount: number, allocated: number): number {
  return round2(Math.max(0, (Number(paymentAmount) || 0) - (Number(allocated) || 0)));
}

export type LedgerRow = { date: string; debit: number; credit: number };

/**
 * Period filtering must keep the brought-forward opening balance so the running
 * balance stays correct within the visible window.
 */
export function splitLedgerByPeriod<T extends LedgerRow>(
  rows: T[],
  start: string | null,
): { broughtForward: number; rows: T[] } {
  if (!start) return { broughtForward: 0, rows };
  let bf = 0;
  const visible: T[] = [];
  for (const r of rows) {
    if ((r.date || "") < start) bf += (r.debit || 0) - (r.credit || 0);
    else visible.push(r);
  }
  return { broughtForward: round2(bf), rows: visible };
}

/** Only a negative running balance is a genuine supplier credit. */
export function supplierCreditFromBalance(balance: number): number {
  return round2(Math.max(0, -(Number(balance) || 0)));
}
