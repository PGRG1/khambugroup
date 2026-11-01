import { addDaysIso, firstSaleDates, missingDays, shortDay } from "@/utils/salesRecordChecks";
import { formatCurrency, formatMonthLabel } from "@/utils/format";
import type { SalesRecord } from "@/types/sales";

export type PageWorkItem = { id: string; tone: "amber" | "sage"; title: string; detail: string; label: string; question?: string; href?: string };
export type WorkSale = Pick<SalesRecord, "date" | "venue" | "totalSales">;

/** Completed days only; on the first of a month, show the month just completed. */
export function workComparisonWindow(today: string) {
  const end = addDaysIso(today, -1), start = `${end.slice(0, 7)}-01`;
  const year = Number(end.slice(0, 4)) - 1;
  const lastDay = new Date(Date.UTC(year, Number(end.slice(5, 7)), 0)).getUTCDate();
  return { start, end, priorStart: `${year}${start.slice(4)}`, priorEnd: `${year}${end.slice(4, 8)}${String(Math.min(Number(end.slice(8)), lastDay)).padStart(2, "0")}` };
}

export function revenuePageWork(sales: WorkSale[], venues: { id: string; name: string }[], today: string, isClosed: (id: string, date: string) => unknown): PageWorkItem[] {
  const history = sales as SalesRecord[];
  const from = addDaysIso(today, -7), closed = new Set<string>();
  for (let day = from; day < today; day = addDaysIso(day, 1)) for (const venue of venues) if (isClosed(venue.id, day)) closed.add(`${venue.id}|${day}`);
  const gaps = missingDays(history, venues, from, addDaysIso(today, -1), today, firstSaleDates(history), closed);
  // Latest missing past day for each venue, grouped by date so every scoped venue is represented.
  const latest = new Map<string, typeof gaps[number]>();
  for (const gap of gaps) latest.set(gap.venueId, gap);
  const groups = new Map<string, string[]>();
  for (const gap of latest.values()) groups.set(gap.date, [...(groups.get(gap.date) ?? []), gap.venue]);
  const items: PageWorkItem[] = [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([date, names]) => ({
    id: `missing-${date}`, tone: "amber", title: `No sales yet for ${shortDay(date)}`,
    detail: `${names.join(" and ")} · ${names.length > 1 ? "none" : "not"} marked closed`, label: "Scan Z", href: "/sales-data?view=daily&scan=1",
  }));
  const window = workComparisonWindow(today);
  for (const venue of venues) {
    const current = sales.filter(r => r.venue === venue.name && r.date >= window.start && r.date <= window.end);
    const prior = sales.filter(r => r.venue === venue.name && r.date >= window.priorStart && r.date <= window.priorEnd);
    if (!current.length) continue; // Missing history is unknown, never a fabricated zero.
    const title = `${venue.name} ${formatMonthLabel(window.start.slice(0, 7))}: ${formatCurrency(current.reduce((n, r) => n + r.totalSales, 0))}`;
    items.push({ id: `sales-${venue.id}`, tone: "sage", title,
      detail: prior.length ? `${formatMonthLabel(window.priorStart.slice(0, 7))} 1–${Number(window.priorEnd.slice(8))}: ${formatCurrency(prior.reduce((n, r) => n + r.totalSales, 0))}` : "Same days last year: no sales records",
      label: "Show", question: `Compare ${venue.name} sales for ${window.start} to ${window.end} with ${window.priorStart} to ${window.priorEnd}. Show recorded figures and any missing sales days.`,
    });
  }
  return items.slice(0, 3);
}

export function pageQuestions(path: string): string[] {
  if (/^\/(revenue|sales-data|forecast|kpis)/.test(path)) return ["Compare venues this week", "Which was the best sales day last month?"];
  if (path.startsWith("/expenses")) return ["Which bills are waiting for approval?", "Show regular bills received this month"];
  if (path.startsWith("/hr")) return ["What inputs are missing on this page?", "Show this week's rota"];
  if (path.startsWith("/procurement")) return ["Which invoices need a look?", "Which supplier prices changed this month?"];
  if (path.startsWith("/finance")) return ["Which items need my attention?", "What is due this week?"];
  return ["Compare venues this week", "Show missing sales days"];
}