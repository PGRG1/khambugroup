export type PeriodGranularity = "month" | "quarter" | "year";

export interface CashflowEntry {
  date: string; // ISO date YYYY-MM-DD
  amount: number;
  category: "sales" | "invoice" | "payroll_salary" | "payroll_mpf" | "manual";
  label: string;
  venue?: string;
  reference?: string;
}

export interface PeriodBucket {
  key: string; // e.g. "2025-03", "2025-Q1", "2025"
  label: string;
  start: Date;
  end: Date;
  inflows: number;
  outflows: number;
  net: number;
  inflowEntries: CashflowEntry[];
  outflowEntries: CashflowEntry[];
}

export function getPeriodKey(dateStr: string, granularity: PeriodGranularity): { key: string; label: string } {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (granularity === "year") {
    return { key: `${y}`, label: `${y}` };
  }
  if (granularity === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
  }
  const month = String(m + 1).padStart(2, "0");
  const monthName = d.toLocaleString("en-US", { month: "short" });
  return { key: `${y}-${month}`, label: `${monthName} ${y}` };
}

export function bucketEntries(
  inflows: CashflowEntry[],
  outflows: CashflowEntry[],
  granularity: PeriodGranularity,
): PeriodBucket[] {
  const map = new Map<string, PeriodBucket>();

  const ensure = (entry: CashflowEntry) => {
    const { key, label } = getPeriodKey(entry.date, granularity);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        start: new Date(entry.date),
        end: new Date(entry.date),
        inflows: 0,
        outflows: 0,
        net: 0,
        inflowEntries: [],
        outflowEntries: [],
      });
    }
    return map.get(key)!;
  };

  inflows.forEach((e) => {
    const b = ensure(e);
    b.inflows += e.amount;
    b.inflowEntries.push(e);
  });
  outflows.forEach((e) => {
    const b = ensure(e);
    b.outflows += e.amount;
    b.outflowEntries.push(e);
  });

  map.forEach((b) => {
    b.net = b.inflows - b.outflows;
  });

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function applyOpeningBalance(
  buckets: PeriodBucket[],
  openingBalance: number,
  openingDate: string,
): Array<PeriodBucket & { runningBalance: number }> {
  let running = openingBalance;
  const opening = new Date(openingDate).getTime();
  return buckets.map((b) => {
    // only count buckets that begin on/after opening date for running balance
    if (b.start.getTime() >= opening) {
      running += b.net;
    }
    return { ...b, runningBalance: running };
  });
}

export const CASHFLOW_VENUES = ["Assembly", "Caliente", "Hanabi", "Events"] as const;
