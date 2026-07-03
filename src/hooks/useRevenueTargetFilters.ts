import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { OperatingStatus } from "@/types/revenueTargetsV2";

/**
 * URL-state shared filters for Revenue Targets v2 pages.
 *
 * URL format (all optional; empty = "all"):
 *   ?rt_month=YYYY-MM
 *   &rt_venues=<uuid>,<uuid>
 *   &rt_periods=<uuid>,<uuid>
 *   &rt_dow=0,1,2   (0=Sun..6=Sat)
 *   &rt_status=normal,mixed
 */
const KEYS = {
  month: "rt_month",
  venues: "rt_venues",
  periods: "rt_periods",
  dow: "rt_dow",
  status: "rt_status",
} as const;

export interface RevenueTargetFilters {
  year: number;
  month: number;
  venueIds: string[];
  servicePeriodIds: string[];
  weekdays: number[];
  operatingStatuses: OperatingStatus[];
}

function parseCsv(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseIntCsv(v: string | null): number[] {
  return parseCsv(v).map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

export function useRevenueTargetFilters(defaults?: { year?: number; month?: number }): {
  filters: RevenueTargetFilters;
  setMonth: (year: number, month: number) => void;
  setVenues: (ids: string[]) => void;
  setPeriods: (ids: string[]) => void;
  setWeekdays: (dow: number[]) => void;
  setStatuses: (statuses: OperatingStatus[]) => void;
  reset: () => void;
} {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<RevenueTargetFilters>(() => {
    const today = new Date();
    const defYear = defaults?.year ?? today.getFullYear();
    const defMonth = defaults?.month ?? today.getMonth() + 1;
    const raw = params.get(KEYS.month);
    let year = defYear, month = defMonth;
    if (raw && /^\d{4}-\d{2}$/.test(raw)) {
      const [y, m] = raw.split("-").map(Number);
      if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) { year = y; month = m; }
    }
    return {
      year, month,
      venueIds: parseCsv(params.get(KEYS.venues)),
      servicePeriodIds: parseCsv(params.get(KEYS.periods)),
      weekdays: parseIntCsv(params.get(KEYS.dow)).filter((n) => n >= 0 && n <= 6),
      operatingStatuses: parseCsv(params.get(KEYS.status)).filter(
        (s): s is OperatingStatus => (["normal","mixed","events_only","closed"] as string[]).includes(s),
      ),
    };
  }, [params, defaults?.year, defaults?.month]);

  const mutate = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null || value === "") next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  }, [params, setParams]);

  return {
    filters,
    setMonth: (y, m) => mutate(KEYS.month, `${y}-${String(m).padStart(2, "0")}`),
    setVenues: (ids) => mutate(KEYS.venues, ids.join(",")),
    setPeriods: (ids) => mutate(KEYS.periods, ids.join(",")),
    setWeekdays: (dow) => mutate(KEYS.dow, dow.join(",")),
    setStatuses: (s) => mutate(KEYS.status, s.join(",")),
    reset: () => {
      const next = new URLSearchParams(params);
      Object.values(KEYS).forEach((k) => next.delete(k));
      setParams(next, { replace: true });
    },
  };
}
