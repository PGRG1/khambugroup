// Single source of truth for number, currency, percent and date formatting.
// Brand convention: HK$ 1,234.56  /  03 May 2026

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toDate(d: string | Date | number | null | undefined): Date | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "HK$ 1,234.56" — prefix + thousands sep + 2 decimals by default */
export function formatCurrency(value: number, opts: { decimals?: 0 | 2; sign?: boolean; symbol?: string } = {}): string {
  const { decimals = 2, sign = false, symbol = "HK$" } = opts;
  if (!isFinite(value)) return `${symbol} 0${decimals ? ".00" : ""}`;
  const negative = value < 0;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const prefix = negative ? "-" : sign && value > 0 ? "+" : "";
  return `${prefix}${symbol} ${formatted}`;
}

/** Number with no currency, e.g. "1,234" */
export function formatNumber(value: number, decimals = 0): string {
  if (!isFinite(value)) return "0";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "12.3%" */
export function formatPercent(value: number, decimals = 1): string {
  if (!isFinite(value)) return "0%";
  return `${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

/** "HK$ 12.3K" / "HK$ 1.2M" — for compact KPI display */
export function formatCurrencyCompact(value: number, symbol = "HK$"): string {
  if (!isFinite(value)) return `${symbol} 0`;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${symbol} ${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${symbol} ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol} ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${symbol} ${Math.round(abs)}`;
}

/** "03 May 2026" */
export function formatDate(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${pad2(dt.getDate())} ${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "03 May" */
export function formatDateShort(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${pad2(dt.getDate())} ${MONTH_SHORT[dt.getMonth()]}`;
}

/** "May 2026" */
export function formatMonth(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "03 May 2026 14:32" */
export function formatDateTime(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${formatDate(dt)} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}
