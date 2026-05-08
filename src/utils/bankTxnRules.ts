// Built-in transaction recognition for bank statement lines.
// Pure functions, used both at commit time and live when rendering.

export type Suggestion = {
  suggested_type: string;
  suggested_category?: string;
  reason: string;
};

export const SUGGESTED_TYPE_LABEL: Record<string, string> = {
  kpay_settlement: "KPay Settlement",
  bank_fee: "Bank Fee",
  customer_receipt: "Customer Receipt",
  supplier_payment: "Supplier / Expense Payment",
  internal_transfer: "Internal Transfer",
  reversal: "Reversal / Return",
  cash_deposit: "Cash Deposit",
  utility_payment: "Utility Payment",
  interest_income: "Interest Income",
};

export type UserRule = {
  id: string;
  name: string;
  match_contains: string;
  suggested_type: string;
  suggested_category: string | null;
  is_active: boolean;
  sort_order: number;
};

export function classifyTxn(
  description: string,
  money_in: number,
  money_out: number,
  userRules: UserRule[] = [],
): Suggestion | null {
  const d = (description || "").toUpperCase();
  if (!d) return null;

  // user rules first (highest priority)
  for (const r of userRules) {
    if (!r.is_active) continue;
    if (r.match_contains && d.includes(r.match_contains.toUpperCase())) {
      return {
        suggested_type: r.suggested_type,
        suggested_category: r.suggested_category || undefined,
        reason: `User rule: ${r.name}`,
      };
    }
  }

  if (d.includes("FPS OUT FEE")) return { suggested_type: "bank_fee", suggested_category: "Bank Charges", reason: "FPS OUT FEE → Bank Charges" };
  if (d.includes("KPAY MERCHANT SERVICE")) return { suggested_type: "kpay_settlement", reason: "KPAY MERCHANT SERVICE → settlement" };
  if (d.includes("CBS TRANSFER")) return { suggested_type: "internal_transfer", reason: "CBS TRANSFER → internal transfer" };
  if (/\bFPS\s*RTN\b/.test(d) || /\bRTN\b/.test(d) || /\bCORR\b/.test(d)) return { suggested_type: "reversal", reason: "Reversal / return marker" };
  if (d.includes("ATM DEP") || d.includes("CDM DEP")) return { suggested_type: "cash_deposit", reason: "Cash machine deposit" };
  if (d.includes("JP-GAS")) return { suggested_type: "utility_payment", suggested_category: "Utilities - Gas", reason: "JP-GAS → Gas utility" };
  if (d.includes("JP-WSD")) return { suggested_type: "utility_payment", suggested_category: "Utilities - Water", reason: "JP-WSD → Water utility" };
  if (/^INTEREST\b/.test(d) || d === "INTEREST") return { suggested_type: "interest_income", reason: "Interest credit" };

  // FPS deposit/withdrawal
  if (d.startsWith("FPS") || d.startsWith("TRANSFER\nFPS") || d.includes("FPS/")) {
    if (money_in > 0) return { suggested_type: "customer_receipt", reason: "FPS inbound → customer receipt" };
    if (money_out > 0) return { suggested_type: "supplier_payment", reason: "FPS outbound → supplier payment" };
  }
  return null;
}
