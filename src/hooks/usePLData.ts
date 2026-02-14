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
  grossRevenue: number;
  serviceChargeRevenue: number;
  discounts: number;
  netSales: number;
}

export interface PLData {
  assembly: VenueRevenue;
  caliente: VenueRevenue;
  totalRevenue: number;
  manual: Record<string, number>; // line_item_name -> summed amount
  unknownManualLines: { name: string; amount: number }[];
}

const KNOWN_LINES = [
  "Beverage Cost", "Food Cost",
  "Base Rental", "Rental Share (-)", "Government Fees", "Management Fees",
  "FTE Salary", "FTE MPF", "PTE Salary", "PTE MPF",
  "Electricity", "Water", "HKT/PCCW",
  "Card Processing Fees", "Office Administration Fees",
  "Other Expenses", "Miscellaneous Expenses",
  "Depreciation", "Amortization",
];

export function usePLData(view: "monthly" | "annual", year: number, month: number) {
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [manualLines, setManualLines] = useState<PLManualLine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Build date filters for sales_records (date is text like "2025-01-15")
    let dateFilter: { gte: string; lte: string };
    if (view === "monthly") {
      const mm = String(month).padStart(2, "0");
      dateFilter = { gte: `${year}-${mm}-01`, lte: `${year}-${mm}-31` };
    } else {
      dateFilter = { gte: `${year}-01-01`, lte: `${year}-12-31` };
    }

    const [salesRes, manualRes] = await Promise.all([
      supabase
        .from("sales_records")
        .select("venue, subtotal, service_charge, discount, total_sales")
        .gte("date", dateFilter.gte)
        .lte("date", dateFilter.lte),
      supabase
        .from("pl_manual_lines")
        .select("*")
        .eq("year", year)
        .then(res => res), // we'll filter month client-side
    ]);

    if (salesRes.data) setRevenueData(salesRes.data);
    if (manualRes.data) setManualLines(manualRes.data as PLManualLine[]);
    setLoading(false);
  }, [view, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const plData = useMemo<PLData>(() => {
    const emptyVenue = (): VenueRevenue => ({ grossRevenue: 0, serviceChargeRevenue: 0, discounts: 0, netSales: 0 });
    const assembly = emptyVenue();
    const caliente = emptyVenue();

    for (const r of revenueData) {
      const target = r.venue === "Assembly" ? assembly : r.venue === "Caliente" ? caliente : null;
      if (!target) continue;
      target.grossRevenue += Number(r.subtotal) || 0;
      target.serviceChargeRevenue += Number(r.service_charge) || 0;
      target.discounts += Number(r.discount) || 0;
      target.netSales += Number(r.total_sales) || 0;
    }

    // Filter manual lines by period
    const filtered = manualLines.filter(l => {
      if (view === "monthly") return l.month === month;
      // annual: include all rows for the year
      return true;
    });

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

    // Fill known lines with 0
    for (const k of KNOWN_LINES) {
      if (!(k in manual)) manual[k] = 0;
    }

    const unknownManualLines = Object.entries(unknownMap).map(([name, amount]) => ({ name, amount }));

    return {
      assembly,
      caliente,
      totalRevenue: assembly.netSales + caliente.netSales,
      manual,
      unknownManualLines,
    };
  }, [revenueData, manualLines, view, month]);

  return { plData, loading, refetch: fetchData };
}
