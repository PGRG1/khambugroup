import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PLManualLine {
  id: string;
  year: number;
  month: number | null;
  line_item_name: string;
  amount: number;
  notes: string;
}

interface VenueRevenue {
  venue: string;
  grossRevenue: number;
  serviceChargeRevenue: number;
  discounts: number;
  netSales: number;
}

export interface PLPeriodData {
  venues: VenueRevenue[];
  totalRevenue: number;
  manual: Record<string, number>;
  unknownManualLines: { name: string; amount: number }[];
}

export const KNOWN_LINES = [
  "Beverage Cost", "Food Cost",
  "Base Rental", "Rental Share (-)", "Government Fees", "Management Fees",
  "FTE Salary", "FTE MPF", "PTE Salary", "PTE MPF",
  "Electricity", "Water", "HKT/PCCW",
  "Card Processing Fees", "Office Administration Fees",
  "Other Expenses", "Miscellaneous Expenses",
  "Depreciation", "Amortization",
];

export interface PLPeriodKey {
  year: number;
  month: number; // 1-12
}

function periodLabel(p: PLPeriodKey): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[p.month - 1]} ${p.year}`;
}

function buildPeriodData(
  revenueData: any[],
  manualLines: PLManualLine[],
  period: PLPeriodKey
): PLPeriodData {
  const mm = String(period.month).padStart(2, "0");
  const prefix = `${period.year}-${mm}`;

  // Dynamic venue aggregation
  const venueMap = new Map<string, VenueRevenue>();

  for (const r of revenueData) {
    if (!(r.date as string).startsWith(prefix)) continue;
    const venueName = r.venue as string;
    if (!venueMap.has(venueName)) {
      venueMap.set(venueName, { venue: venueName, grossRevenue: 0, serviceChargeRevenue: 0, discounts: 0, netSales: 0 });
    }
    const target = venueMap.get(venueName)!;
    target.grossRevenue += Number(r.subtotal) || 0;
    target.serviceChargeRevenue += Number(r.service_charge) || 0;
    target.discounts += Number(r.discount) || 0;
    target.netSales += Number(r.total_sales) || 0;
  }

  const venues = [...venueMap.values()].sort((a, b) => a.venue.localeCompare(b.venue));

  const filtered = manualLines.filter(l => l.month === period.month && l.year === period.year);

  const manual: Record<string, number> = {};
  const unknownMap: Record<string, number> = {};

  for (const l of filtered) {
    const amt = Number(l.amount) || 0;
    if (KNOWN_LINES.includes(l.line_item_name)) {
      manual[l.line_item_name] = (manual[l.line_item_name] || 0) + amt;
    } else {
      unknownMap[l.line_item_name] = (unknownMap[l.line_item_name] || 0) + amt;
    }
  }

  for (const k of KNOWN_LINES) {
    if (!(k in manual)) manual[k] = 0;
  }

  const unknownManualLines = Object.entries(unknownMap).map(([name, amount]) => ({ name, amount }));

  return {
    venues,
    totalRevenue: venues.reduce((s, v) => s + v.netSales, 0),
    manual,
    unknownManualLines,
  };
}

/**
 * Multi-period P&L hook. Fetches all data for a year range and computes per-period.
 */
export function usePLMultiPeriod(periods: PLPeriodKey[]) {
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [manualLines, setManualLines] = useState<PLManualLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Determine date range across all periods
  const dateRange = useMemo(() => {
    if (periods.length === 0) return { gte: "2000-01-01", lte: "2099-12-31" };
    const sorted = [...periods].sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      gte: `${first.year}-${String(first.month).padStart(2, "0")}-01`,
      lte: `${last.year}-${String(last.month).padStart(2, "0")}-31`,
    };
  }, [periods]);

  const years = useMemo(() => [...new Set(periods.map(p => p.year))], [periods]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [salesRes, manualRes] = await Promise.all([
      supabase
        .from("sales_records")
        .select("venue, subtotal, service_charge, discount, total_sales, date")
        .gte("date", dateRange.gte)
        .lte("date", dateRange.lte),
      // Fetch manual lines for all relevant years
      supabase
        .from("pl_manual_lines")
        .select("*")
        .in("year", years),
    ]);
    if (salesRes.data) setRevenueData(salesRes.data);
    if (manualRes.data) setManualLines(manualRes.data as PLManualLine[]);
    setLoading(false);
  }, [dateRange.gte, dateRange.lte, years]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodData = useMemo(() => {
    return periods.map(p => ({
      key: p,
      label: periodLabel(p),
      data: buildPeriodData(revenueData, manualLines, p),
    }));
  }, [revenueData, manualLines, periods]);

  // Compute totals across all periods
  const totals = useMemo<PLPeriodData>(() => {
    const result: PLPeriodData = {
      venues: [],
      totalRevenue: 0,
      manual: {},
      unknownManualLines: [],
    };
    const venueMap = new Map<string, VenueRevenue>();
    const unknownMap: Record<string, number> = {};

    for (const pd of periodData) {
      const d = pd.data;
      for (const v of d.venues) {
        if (!venueMap.has(v.venue)) {
          venueMap.set(v.venue, { venue: v.venue, grossRevenue: 0, serviceChargeRevenue: 0, discounts: 0, netSales: 0 });
        }
        const target = venueMap.get(v.venue)!;
        target.grossRevenue += v.grossRevenue;
        target.serviceChargeRevenue += v.serviceChargeRevenue;
        target.discounts += v.discounts;
        target.netSales += v.netSales;
      }
      result.totalRevenue += d.totalRevenue;
      for (const [k, v] of Object.entries(d.manual)) {
        result.manual[k] = (result.manual[k] || 0) + v;
      }
      for (const ul of d.unknownManualLines) {
        unknownMap[ul.name] = (unknownMap[ul.name] || 0) + ul.amount;
      }
    }
    for (const k of KNOWN_LINES) {
      if (!(k in result.manual)) result.manual[k] = 0;
    }
    result.venues = [...venueMap.values()].sort((a, b) => a.venue.localeCompare(b.venue));
    result.unknownManualLines = Object.entries(unknownMap).map(([name, amount]) => ({ name, amount }));
    return result;
  }, [periodData]);

  return { periodData, totals, loading, refetch: fetchData, manualLines };
}

// Keep backward compat for editor
export function usePLData(view: "monthly" | "annual", year: number, month: number) {
  const periods = useMemo(() => {
    if (view === "monthly") return [{ year, month }];
    return Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }));
  }, [view, year, month]);

  const { totals, loading, refetch } = usePLMultiPeriod(periods);

  return { plData: totals, loading, refetch };
}
