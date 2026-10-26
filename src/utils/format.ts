/** Compact currency used in dense tables; keep other app currency displays unchanged. */
export function formatTableCurrency(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}HK$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(rounded))}`;
}

export function formatTableInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}