/** Presentation-only period defaults; invoice totals and scope are unchanged. */
export function defaultInvoiceMonth(currentMonth: string, invoiceDates: string[]): string {
  const months = invoiceDates.map(date => date.slice(0, 7)).filter(month => /^\d{4}-\d{2}$/.test(month));
  if (months.includes(currentMonth)) return currentMonth;
  return months.sort().at(-1) ?? currentMonth;
}

export function trailingMonths(selected: string): string[] {
  const [year, month] = selected.split("-").map(Number);
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 8 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Spend and budget use the same money axis, with headroom for the marker. */
export function budgetBarScale(amounts: number[]): number {
  return Math.max(1, ...amounts.map(amount => Math.max(0, Number(amount)))) * 1.1;
}

export function rankedBudgetCategories(spend: { name: string; value: number }[], budgets: Map<string, number>) {
  const names = new Set([...spend.map(row => row.name), ...budgets.keys()]);
  return [...names].filter(name => name !== "Discount / Refund").map(name => ({
    name, value: spend.find(row => row.name === name)?.value ?? 0,
    budget: budgets.has(name) ? Number(budgets.get(name)) : null,
  })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}