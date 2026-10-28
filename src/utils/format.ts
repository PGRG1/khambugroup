/** Compact currency used in dense tables; keep other app currency displays unchanged. */
export function formatTableCurrency(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}HK$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(rounded))}`;
}

export function formatTableInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null): string {
  return value == null ? "—" : `${formatDecimal(value, 1)}%`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}