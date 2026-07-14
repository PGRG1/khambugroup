import type { ReactNode } from "react";

/**
 * Responsive font-size class for KPI/stat card values so long numeric strings
 * (e.g. "HK$ 12,345,678") always fit on one line without ellipsis truncation.
 * Steps down gradually based on character count. Pair with
 * `whitespace-nowrap` on the value element and drop any `truncate` class.
 */
export function kpiValueSizeClass(value: ReactNode): string {
  const len = typeof value === "string" ? value.length : 0;
  if (len <= 10) return "text-xl md:text-2xl";
  if (len <= 13) return "text-lg md:text-xl";
  if (len <= 16) return "text-base md:text-lg";
  if (len <= 20) return "text-sm md:text-base";
  return "text-xs md:text-sm";
}
