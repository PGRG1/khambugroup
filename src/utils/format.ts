/**
 * Centralised formatting utilities for the entire application.
 * Memory rule: Currency = `HK$ 1,234.56`, Date = `03 May 2026`.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Full date: "03 May 2026" */
export function formatDate(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Compact date for charts/dense tables: "03 May" */
export function formatDateShort(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS_SHORT[dt.getMonth()]}`;
}

/** Month label: "May 2026" */
export function formatMonth(d: string | Date | null | undefined): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

interface NumberOptions {
  decimals?: number;
  /** Wrap negatives in parentheses: (1,250). Default: true */
  parenNegatives?: boolean;
}

/** Plain number with thousands separators. */
export function formatNumber(value: number | null | undefined, opts: NumberOptions = {}): string {
  if (value == null || isNaN(value)) return "—";
  const { decimals = 0, parenNegatives = false } = opts;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (value < 0) return parenNegatives ? `(${formatted})` : `-${formatted}`;
  return formatted;
}

/** Currency: "HK$ 1,234" or "HK$ 1,234.56". Negatives shown as (HK$ 1,234). */
export function formatCurrency(
  value: number | null | undefined,
  opts: { decimals?: number; symbol?: string; parenNegatives?: boolean } = {},
): string {
  if (value == null || isNaN(value)) return "—";
  const { decimals = 0, symbol = "HK$", parenNegatives = true } = opts;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const body = `${symbol} ${formatted}`;
  if (value < 0) return parenNegatives ? `(${body})` : `-${body}`;
  return body;
}

/** Percent: "12.4%" (input is already a percentage value, not 0-1). */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || isNaN(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

/** Ratio percent: input is 0..1, output is "12.4%". */
export function formatRatio(value: number | null | undefined, decimals = 1): string {
  if (value == null || isNaN(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Compact KPI: "$12.4K" / "$1.2M" — for tight cards only. */
export function formatCompactCurrency(value: number | null | undefined, symbol = "HK$"): string {
  if (value == null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${symbol} ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol} ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${symbol} ${abs.toFixed(0)}`;
}
