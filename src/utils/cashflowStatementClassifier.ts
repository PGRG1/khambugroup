// Classifies a cash journal line into a Cashflow Statement section/line item
// based on the counter-account(s) of the same journal entry.

export type CashflowSection = "operating" | "investing" | "financing";

export interface CashflowStatementLine {
  section: CashflowSection;
  lineItem: string;
  sortOrder: number;
}

export interface CounterAccount {
  code: string;
  account_type: string; // asset, liability, equity, revenue, cogs, opex, other_income, other_expense
}

// Returns the classification for a cash movement based on its counter-accounts
// and the direction of the cash flow (positive = inflow, negative = outflow).
export function classifyCashMovement(
  counters: CounterAccount[],
  direction: 1 | -1,
): CashflowStatementLine {
  // Pick the most "informative" counter-account: prefer non-suspense, non-tax accounts
  const filtered = counters.filter(
    (c) => c.code !== "1900" && c.code !== "2200", // exclude suspense / tax payable as primary
  );
  const primary = (filtered[0] || counters[0]) as CounterAccount | undefined;
  const code = primary?.code || "";
  const type = primary?.account_type || "";

  // ============ FINANCING ============
  if (code === "3010" || type === "equity") {
    return direction > 0
      ? { section: "financing", lineItem: "Owner contributions", sortOrder: 10 }
      : { section: "financing", lineItem: "Owner withdrawals", sortOrder: 20 };
  }

  // ============ INVESTING ============
  if (code === "1500") {
    return direction > 0
      ? { section: "investing", lineItem: "Disposal of fixed assets", sortOrder: 20 }
      : { section: "investing", lineItem: "Purchase of fixed assets", sortOrder: 10 };
  }
  if (code === "1310") {
    return direction > 0
      ? { section: "investing", lineItem: "Refunds of supplier deposits", sortOrder: 40 }
      : { section: "investing", lineItem: "Supplier deposits paid", sortOrder: 30 };
  }

  // ============ OPERATING ============
  // Sales receipts
  if (
    type === "revenue" ||
    type === "other_income" ||
    code === "1900" ||
    /^12[0-9]{2}$/.test(code) // merchant receivables 1200-1299
  ) {
    return { section: "operating", lineItem: "Cash receipts from customers", sortOrder: 10 };
  }

  // Payroll splits
  if (code === "2040") {
    return { section: "operating", lineItem: "Cash paid to employees (net salaries)", sortOrder: 30 };
  }
  if (code === "2030") {
    return { section: "operating", lineItem: "MPF contributions paid", sortOrder: 40 };
  }
  if (/^21[0-9]{2}$/.test(code)) {
    return { section: "operating", lineItem: "Tips paid out", sortOrder: 50 };
  }

  // Suppliers
  if (type === "cogs" || code === "2010" || code === "2100") {
    return { section: "operating", lineItem: "Cash paid to suppliers", sortOrder: 20 };
  }

  // Prepayments
  if (code === "1320") {
    return direction > 0
      ? { section: "operating", lineItem: "Recovery of prepayments", sortOrder: 60 }
      : { section: "operating", lineItem: "Prepayments made", sortOrder: 60 };
  }

  // OpEx
  if (type === "opex" || type === "other_expense") {
    return { section: "operating", lineItem: "Other operating payments", sortOrder: 70 };
  }

  // Liabilities (other than payroll/AP/tips already handled)
  if (type === "liability") {
    return direction > 0
      ? { section: "financing", lineItem: "Loan / liability proceeds", sortOrder: 30 }
      : { section: "financing", lineItem: "Loan / liability repayments", sortOrder: 40 };
  }

  return {
    section: "operating",
    lineItem: direction > 0 ? "Other operating receipts" : "Other operating payments",
    sortOrder: 80,
  };
}

export const SECTION_LABELS: Record<CashflowSection, string> = {
  operating: "Cash flows from operating activities",
  investing: "Cash flows from investing activities",
  financing: "Cash flows from financing activities",
};

export const SECTION_ORDER: CashflowSection[] = ["operating", "investing", "financing"];
