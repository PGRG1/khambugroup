// Bani's master chart of accounts lives in coa_templates (the "F&B — Hong Kong" row). Each account carries its
// statement group; the group decides the Bani account type and usual side (contra accounts may flip the side).

export const MASTER_COA_TEMPLATE_ID = "11996edb-2890-41f0-8203-fbb5522a4cf9";

export type MasterAccount = {
  code: string; name: string; group: string; account_type: string; normal_side: "debit" | "credit";
  is_system: boolean; is_cash: boolean; sort_order: number;
};

const GROUP_TYPES: [string, string, "debit" | "credit"][] = [
  ["Current assets", "asset", "debit"], ["Fixed assets", "asset", "debit"],
  ["Current liabilities", "liability", "credit"], ["Non-current liabilities", "liability", "credit"],
  ["Equity", "equity", "credit"], ["Revenue", "revenue", "credit"], ["Other income", "other_income", "credit"],
  ["Cost of sales", "cogs", "debit"], ["Operating expenses", "opex", "debit"], ["Other expenses", "other_expense", "debit"],
];
export const COA_GROUPS = GROUP_TYPES.map(g => g[0]);

/** Account type for a group, the group's usual side unless a side is given, and cash flag for bank/cash codes. */
export function groupDefaults(group: string, code: string, side?: "debit" | "credit") {
  const g = GROUP_TYPES.find(x => x[0] === group) ?? GROUP_TYPES[8];
  return { account_type: g[1], normal_side: side ?? g[2], is_cash: group === "Current assets" && /^10[0-2]\d$/.test(code) };
}
