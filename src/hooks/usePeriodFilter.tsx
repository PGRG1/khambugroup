import { useMemo, useState } from "react";
import DateFilter from "@/components/dashboard/DateFilter";
import { mtdRange } from "@/components/revenue-overview/utils";
import { monthSoFarLabel, iso } from "@/utils/revenueOverview";
import { formatMonthLabel } from "@/utils/format";

/** Shared Period picker state for Purchasing list pages (MTD or All time default). */
export function usePeriodFilter(dates: string[], initial: "MTD" | "all" = "MTD") {
  const start = initial === "MTD" ? mtdRange() : { from: undefined, to: undefined };
  const [period, setPeriod] = useState<string>(initial);
  const [from, setFrom] = useState<Date | undefined>(start.from);
  const [to, setTo] = useState<Date | undefined>(start.to);
  const months = useMemo(() => [...new Set(dates.map(d => (d || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [dates]);
  const label = period === "MTD" ? monthSoFarLabel() : period === "all" ? "All time" : period === "custom" ? "Selected dates" : formatMonthLabel(period);
  const fromIso = from ? iso(from) : undefined;
  const toIso = to ? iso(to) : undefined;
  const inPeriod = (d?: string | null) => (!fromIso || (!!d && d.slice(0, 10) >= fromIso)) && (!toIso || (!!d && d.slice(0, 10) <= toIso));
  const control = (
    <DateFilter labelled includeMtd initialPeriod={initial === "MTD" ? "MTD" : "All Time"} from={from} to={to}
      onFromChange={d => { setPeriod("custom"); setFrom(d); }} onToChange={d => { setPeriod("custom"); setTo(d); }}
      months={months.map(formatMonthLabel)}
      onPeriodSelect={sel => {
        if (sel === "MTD") { const r = mtdRange(); setPeriod("MTD"); setFrom(r.from); setTo(r.to); }
        else if (sel === "All Time") { setPeriod("all"); setFrom(undefined); setTo(undefined); }
        else { const m = months.find(v => formatMonthLabel(v) === sel); if (m) { const [y, mo] = m.split("-").map(Number); setPeriod(m); setFrom(new Date(y, mo - 1, 1)); setTo(new Date(y, mo, 0)); } }
      }} />
  );
  return { label, control, inPeriod, fromIso, toIso };
}
