import { dueFromTerms } from "@/utils/financeReportViews";

type ApInvoice = { outstanding_amount: number; payment_status: string | null; venue: string | null; invoice_date: string; due_date: string | null; supplier_id: string };
type Obligation = { amount: number; due: string | null };
type ArItem = { venue?: string | null; open_amount: number | string; age_days: number };

/**
 * What the business owes and is owed, the same way on Home and the Finance Overview:
 * unpaid supplier invoices plus other obligations (overdue = past their due date), and
 * customers' open items. Venue scope is applied by the caller's `inScope`.
 */
export function owedSummary(input: {
  apInvoices: ApInvoice[]; obligations: Obligation[]; arItems: ArItem[];
  inScope: (venue: string | null | undefined) => boolean;
  termsFor: (supplierId: string) => string | null | undefined; today: string;
}) {
  const supplierItems = input.apInvoices.filter((i) => i.outstanding_amount > .005 && i.payment_status !== "voided" && input.inScope(i.venue))
    .map((i) => ({ amount: i.outstanding_amount, due: dueFromTerms(i.invoice_date, i.due_date, input.termsFor(i.supplier_id)) }));
  const owedItems = [...supplierItems, ...input.obligations.map((i) => ({ amount: i.amount, due: i.due }))];
  const customers = input.arItems.filter((i) => !i.venue || input.inScope(i.venue));
  return {
    owedItems, customers,
    payable: owedItems.reduce((n, i) => n + i.amount, 0),
    overdue: owedItems.filter((i) => i.due && i.due < input.today).reduce((n, i) => n + i.amount, 0),
    receivable: customers.reduce((n, i) => n + Number(i.open_amount), 0),
  };
}
