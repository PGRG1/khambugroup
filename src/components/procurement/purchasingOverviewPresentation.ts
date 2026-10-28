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