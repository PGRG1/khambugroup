// Centralised mapping from AI-suggested document type → routing destination in the app.

export type DocumentClass =
  | "procurement_invoice"
  | "expense_bill"
  | "vendor_statement"
  | "asset_purchase"
  | "payroll"
  | "bank_document"
  | "manual_journal"
  | "unknown";

export function classifyDocument(
  suggested?: string | null,
  hints?: { hasLineItems?: boolean; hasOpeningBalance?: boolean }
): DocumentClass {
  const s = (suggested || "").toLowerCase();
  if (s.includes("statement") || hints?.hasOpeningBalance) return "vendor_statement";
  if (s.includes("procurement") || s.includes("inventory") || s.includes("stock"))
    return "procurement_invoice";
  if (s.includes("asset") || s.includes("capital")) return "asset_purchase";
  if (s.includes("payroll") || s.includes("salary")) return "payroll";
  if (s.includes("bank") || s.includes("settlement")) return "bank_document";
  if (s.includes("journal") || s.includes("adjustment")) return "manual_journal";
  if (s.includes("bill") || s.includes("expense") || s.includes("utility") || s.includes("invoice"))
    return "expense_bill";
  return "unknown";
}

export const DOC_CLASS_LABELS: Record<DocumentClass, string> = {
  procurement_invoice: "Procurement Invoice",
  expense_bill: "Expense Bill",
  vendor_statement: "Vendor Statement",
  asset_purchase: "Asset Purchase",
  payroll: "Payroll / Staff Cost",
  bank_document: "Bank / Payment Document",
  manual_journal: "Manual Journal",
  unknown: "Unclassified",
};

export function routeForClass(c: DocumentClass): string {
  switch (c) {
    case "procurement_invoice":
      return "/procurement/invoices";
    case "expense_bill":
      return "/expenses/bills";
    case "bank_document":
      return "/finance/bank-reconciliation";
    case "payroll":
      return "/hr/payroll";
    case "asset_purchase":
      return "/finance/journal";
    case "manual_journal":
      return "/finance/journal";
    default:
      return "/expenses";
  }
}
