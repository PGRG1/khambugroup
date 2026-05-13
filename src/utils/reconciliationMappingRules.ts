// Reconciliation Mapping Rules — drives bank-transaction classification + match
// suggestions BEFORE falling back to the legacy classifier or AI. No journal posting here.

import { supabase } from "@/integrations/supabase/client";

export type BankMovement = "money_in" | "money_out" | "either";

export type ReconMappingRule = {
  id: string;
  rule_name: string;
  bank_description_contains: string;
  bank_movement: BankMovement;
  counterparty_type: string;
  classification: string;
  match_to: string;
  source_required: boolean;
  debit_account: string;
  credit_account: string;
  review_required: boolean;
  auto_post: boolean;
  is_active: boolean;
  sort_order: number;
};

export type ReconMatch = {
  rule_id: string;
  rule_name: string;
  classification: string;
  match_to: string;
  counterparty_type: string;
  debit_account: string;
  credit_account: string;
  source_required: boolean;
  review_required: boolean;
  auto_post: boolean;
  /** Mapped to the existing bank_transactions.suggested_type enum so legacy UI keeps working. */
  suggested_type: string;
  /** Free-text classification for display + persistence. */
  suggested_category: string;
  reason: string;
};

/** Map a rule's free-text classification to the legacy `suggested_type` enum. */
const CLASSIFICATION_TO_SUGGESTED_TYPE: Record<string, string> = {
  "Merchant Settlement": "kpay_settlement",
  "Bank Fee": "bank_fee",
  "Supplier Payment": "supplier_payment",
  "Supplier Refund": "reversal",
  "Cash Deposit": "cash_deposit",
  "Internal Transfer": "internal_transfer",
  "Payroll Payment": "supplier_payment",
  "Payment Return": "reversal",
  "Interest Income": "interest_income",
};

export async function loadReconMappingRules(): Promise<ReconMappingRule[]> {
  const { data, error } = await supabase
    .from("reconciliation_mapping_rules" as any)
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to load reconciliation_mapping_rules", error);
    return [];
  }
  return (data as any) || [];
}

export function matchReconRule(
  description: string,
  money_in: number,
  money_out: number,
  rules: ReconMappingRule[],
): ReconMatch | null {
  const desc = (description || "").toUpperCase();
  if (!desc) return null;
  const isIn = Number(money_in) > 0;
  const isOut = Number(money_out) > 0;

  for (const r of rules) {
    if (!r.is_active) continue;
    const needle = (r.bank_description_contains || "").toUpperCase().trim();
    if (!needle) continue;
    if (!desc.includes(needle)) continue;
    if (r.bank_movement === "money_in" && !isIn) continue;
    if (r.bank_movement === "money_out" && !isOut) continue;

    return {
      rule_id: r.id,
      rule_name: r.rule_name,
      classification: r.classification,
      match_to: r.match_to,
      counterparty_type: r.counterparty_type,
      debit_account: r.debit_account,
      credit_account: r.credit_account,
      source_required: r.source_required,
      review_required: r.review_required,
      auto_post: r.auto_post,
      suggested_type:
        CLASSIFICATION_TO_SUGGESTED_TYPE[r.classification] || "other",
      suggested_category: r.classification,
      reason: `Matched mapping rule: ${r.rule_name}`,
    };
  }
  return null;
}
