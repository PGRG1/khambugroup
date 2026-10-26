import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MessageSquare, Receipt } from "lucide-react";
import type { SalesRecord } from "@/types/sales";
import type { SalesNote } from "@/hooks/useSalesNotes";
import { ChoiceChips, FilterGroup, FilterPanel, QuickFilter, Segmented, SortMenu, StatusPill, Toolbar, type ActiveChip } from "@/components/kit";
import { checkRecord, collapseMissingDays, firstSaleDates, missingDays, missingRunLabel, salesListCounts, shortDay, weekLabel, type MissingRun } from "@/utils/salesRecordChecks";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { ColumnsMenu, EXTRA_COLUMNS, type ExtraColumn } from "./ColumnsMenu";
import { toast } from "sonner";

type SortKey = "date" | "sales" | "guests" | "venue" | ExtraColumn;
type Sort = { key: SortKey; dir: "asc" | "desc" };
type Show = "all" | "attention" | "good";
type Any3 = "any" | "yes" | "no";
interface Filters { show: Show; days: Set<string>; min: string; max: string; receipt: Any3; period: string; note: "any" | "yes" }
const EMPTY: Filters = { show: "all", days: new Set(), min: "", max: "", receipt: "any", period: "all", note: "any" };
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dowOf = (iso: string) => shortDay(iso).slice(0, 3);
export const hkd0 = formatTableCurrency;

type Row = { kind: "record"; r: SalesRecord; ok: boolean; notes: SalesNote[] } | { kind: "missing"; m: MissingRun };

export interface DailyRecordsProps {
  records: SalesRecord[];
  history: SalesRecord[];
  userId?: string;
  venues: { id: string; name: string }[];
  from: string; to: string; today: string;
  periodLabel: string;
  tenantName: string;
  notesByRecord: Map<string, SalesNote[]>;
  servicePeriods: { id: string; name: string }[];
  openId: string | null;
  onOpen: (r: SalesRecord) => void;
  onAddDay?: (date: string, venue: string) => void;
}

export function DailyRecords({ records, history, userId, venues, from, to, today, periodLabel, tenantName, notesByRecord, servicePeriods, openId, onOpen, onAddDay }: DailyRecordsProps) {
  const [search, setSearch] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const storageKey = userId ? `sales-record-columns:${userId}` : null;
  const [columns, setColumns] = useState<ExtraColumn[]>(() => {
    try {
      const saved: unknown = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "[]") : [];
      return Array.isArray(saved) ? EXTRA_COLUMNS.filter((c) => saved.includes(c.key)).map((c) => c.key) : [];
    } catch { return []; }
  });
  const toggleColumn = (key: ExtraColumn) => {
    const next = columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key];
    setColumns(next);
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
    if (sort.key === key && !next.includes(key)) setSort({ key: "date", dir: "desc" });
  };
  const singleVenue = venues.length === 1;
  const periodName = (id?: string | null) => (id ? servicePeriods.find((p) => p.id === id)?.name : undefined);
  const firstSales = useMemo(() => firstSaleDates(history), [history]);
  const neverTraded = venues.filter((v) => !firstSales.has(v.name));
  const runs = useMemo(() => collapseMissingDays(missingDays(records, venues, from, to, today, firstSales)), [records, venues, from, to, today, firstSales]);
  const extraValue = (r: SalesRecord, key: ExtraColumn): number | string => {
    if (key === "servicePeriod") return periodName(r.servicePeriodId) ?? "";
    if (key === "cards") return r.visa + r.mastercard + r.amex + r.unionPay + r.jcb;
    if (key === "ewallets") return r.alipay + r.wechat + r.payme;
    if (key === "delivery") return (r.deliveroo ?? 0) + (r.foodpanda ?? 0) + (r.keeta ?? 0);
    return r[key];
  };

  const allRows = useMemo<Row[]>(() => {
    const rs: Row[] = records.map((r) => ({ kind: "record", r, ok: checkRecord(r).ok, notes: (r.id && notesByRecord.get(r.id)) || [] }));
    const ms: Row[] = runs.map((m) => ({ kind: "missing", m }));
    return [...rs, ...ms];
  }, [records, runs, notesByRecord]);

  const { attention: attentionCount, days: dayCount } = salesListCounts(records, runs);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = f.min === "" ? null : Number(f.min), max = f.max === "" ? null : Number(f.max);
    const pass = (x: Row) => {
      const date = x.kind === "record" ? x.r.date : x.m.date;
      const attn = x.kind === "missing" || !x.ok;
      if (f.show === "attention" && !attn) return false;
      if (f.show === "good" && attn) return false;
      if (f.days.size && !f.days.has(dowOf(date))) return false;
      if (x.kind === "missing") {
        if (min != null || max != null || f.receipt !== "any" || f.period !== "all" || f.note !== "any") return false;
        return !q || `${date} ${x.m.endDate} ${missingRunLabel(x.m)}`.toLowerCase().includes(q);
      }
      const r = x.r;
      if (min != null && r.totalSales < min) return false;
      if (max != null && r.totalSales > max) return false;
      if (f.receipt === "yes" && !r.receiptFileUrl) return false;
      if (f.receipt === "no" && r.receiptFileUrl) return false;
      if (f.period !== "all" && r.servicePeriodId !== f.period) return false;
      if (f.note === "yes" && x.notes.length === 0) return false;
      if (q) {
        const hay = `${r.date} ${shortDay(r.date)} ${r.venue} ${periodName(r.servicePeriodId) ?? ""} ${r.reportNumber} ${x.notes.map((n) => `${n.body} ${n.tag ?? ""}`).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const val = (x: Row): number | string => {
      if (sort.key === "date") return x.kind === "record" ? x.r.date : x.m.date;
      if (sort.key === "venue") return x.kind === "record" ? x.r.venue : x.m.venue;
      if (x.kind === "missing") return Number.NaN;
      if (sort.key === "sales") return x.r.totalSales;
      if (sort.key === "guests") return x.r.guests;
      return extraValue(x.r, sort.key);
    };
    const out = allRows.filter(pass);
    out.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "number" && Number.isNaN(av)) return 1;
      if (typeof bv === "number" && Number.isNaN(bv)) return -1;
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      const d = sort.dir === "asc" ? c : -c;
      if (d !== 0 || sort.key !== "date") return d;
      return (a.kind === "record" ? a.r.venue : a.m.venue).localeCompare(b.kind === "record" ? b.r.venue : b.m.venue);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, f, search, sort, servicePeriods]);

  // ---- sort ----
  const sortOptions: { key: string; label: string }[] = [
    { key: "date-desc", label: "Newest first" }, { key: "date-asc", label: "Oldest first" },
    { key: "sales-desc", label: "Highest sales" }, { key: "sales-asc", label: "Lowest sales" },
    { key: "guests-desc", label: "Most guests" },
  ];
  const sortKey = `${sort.key}-${sort.dir}`;
  if (sortKey === "guests-asc") sortOptions.push({ key: "guests-asc", label: "Fewest guests" });
  if (sort.key === "venue") sortOptions.push({ key: sortKey, label: sort.dir === "asc" ? "Venue A–Z" : "Venue Z–A" });
  const sortedExtra = EXTRA_COLUMNS.find((c) => c.key === sort.key);
  if (sortedExtra) sortOptions.push({ key: sortKey, label: `${sortedExtra.label}: ${sort.dir === "asc" ? "ascending" : "descending"}` });
  const setSortKey = (k: string) => { const [key, dir] = k.split("-") as [SortKey, "asc" | "desc"]; setSort({ key, dir }); };
  const headerSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "venue" ? "asc" : "desc" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null);

  // ---- filters ----
  const activeCount = (f.show !== "all" ? 1 : 0) + (f.days.size ? 1 : 0) + (f.min || f.max ? 1 : 0) + (f.receipt !== "any" ? 1 : 0) + (f.period !== "all" ? 1 : 0) + (f.note !== "any" ? 1 : 0);
  const chips: ActiveChip[] = [];
  if (f.show !== "all") chips.push({ key: "show", label: f.show === "attention" ? "Needs attention" : "All good", onRemove: () => setF({ ...f, show: "all" }) });
  if (f.days.size) chips.push({ key: "days", label: DOWS.filter((d) => f.days.has(d)).join(", "), onRemove: () => setF({ ...f, days: new Set() }) });
  if (f.min || f.max) chips.push({ key: "range", label: f.min && f.max ? `Sales HK$${f.min}–${f.max}` : f.min ? `Sales from HK$${f.min}` : `Sales up to HK$${f.max}`, onRemove: () => setF({ ...f, min: "", max: "" }) });
  if (f.receipt !== "any") chips.push({ key: "receipt", label: f.receipt === "yes" ? "Receipt attached" : "Receipt missing", onRemove: () => setF({ ...f, receipt: "any" }) });
  if (f.period !== "all") chips.push({ key: "period", label: periodName(f.period) ?? "Service period", onRemove: () => setF({ ...f, period: "all" }) });
  if (f.note !== "any") chips.push({ key: "note", label: "Has a note", onRemove: () => setF({ ...f, note: "any" }) });
  if (search.trim()) chips.push({ key: "q", label: `“${search.trim()}”`, onRemove: () => setSearch("") });
  const visibleDays = new Set(visible.map((x) => (x.kind === "record" ? x.r.date : x.m.date))).size;

  // ---- CSV (existing export columns) ----
  const download = () => {
    const recs = visible.filter((x): x is Extract<Row, { kind: "record" }> => x.kind === "record").map((x) => x.r);
    const headers = ["Date","Day","Venue","Report #","Orders","Guests","Subtotal","Service Charge","Discount","Total Sales","VISA","Mastercard","AMEX","Union Pay","JCB","Alipay","WeChat","PayMe","Cash","Card Tips"];
    const esc = (v: string | number) => {
      if (typeof v === "number") return String(v);
      const s = /^[=+@\t\r-]/.test(v) ? `'${v}` : v;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = recs.map((s) => [s.date,s.day,s.venue,s.reportNumber,s.orders,s.guests,s.subtotal,s.serviceCharge,-Math.abs(s.discount),s.totalSales,s.visa,s.mastercard,s.amex,s.unionPay,s.jcb,s.alipay,s.wechat,s.payme,s.cash,s.cardTips].map(esc).join(","));
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sales";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${slug(tenantName)}-sales-${slug(periodLabel)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Downloaded ${recs.length} record${recs.length === 1 ? "" : "s"}`);
  };

  const shownColumns = EXTRA_COLUMNS.filter((c) => columns.includes(c.key));
  const colCount = 4 + (singleVenue ? 0 : 1) + shownColumns.length;
  const colSpanClass = "sales-message-cell";
  const showWeeks = sort.key === "date";
  let lastWeek = "";

  return (
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3" aria-labelledby="daily-records">
      <h2 id="daily-records" className="text-base font-display font-semibold px-1">Daily records</h2>
      <QuickFilter label="Show"
        options={[{ key: "all", label: `All ${dayCount} days` }, { key: "attention", label: "Needs attention", count: attentionCount }]}
        value={f.show === "attention" ? "attention" : "all"}
        onChange={(k) => setF({ ...f, show: k === "attention" ? "attention" : "all" })} />
      <Toolbar
        search={search} onSearch={setSearch} placeholder="Search date, venue, report or note"
        filter={
          <FilterPanel activeCount={activeCount} onReset={() => setF(EMPTY)} resultLabel={`Show ${visibleDays} day${visibleDays === 1 ? "" : "s"}`}>
            <FilterGroup title="Show">
              <Segmented value={f.show} onChange={(show) => setF({ ...f, show })}
                options={[{ key: "all", label: "All" }, { key: "attention", label: "Needs attention" }, { key: "good", label: "All good" }]} />
            </FilterGroup>
            <FilterGroup title="Days of the week">
              <ChoiceChips options={DOWS.map((d) => ({ key: d, label: d }))} selected={f.days}
                onToggle={(d) => { const days = new Set(f.days); days.has(d) ? days.delete(d) : days.add(d); setF({ ...f, days }); }} />
            </FilterGroup>
            <FilterGroup title="Sales between">
              <div className="flex items-center gap-2">
                <input inputMode="numeric" aria-label="Minimum sales" placeholder="Min" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/[^\d.]/g, "") })} className="kit-search !w-full !h-9 px-3 text-sm" />
                <span className="text-muted-foreground">–</span>
                <input inputMode="numeric" aria-label="Maximum sales" placeholder="Max" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/[^\d.]/g, "") })} className="kit-search !w-full !h-9 px-3 text-sm" />
              </div>
            </FilterGroup>
            <FilterGroup title="Receipt">
              <Segmented value={f.receipt} onChange={(receipt) => setF({ ...f, receipt })}
                options={[{ key: "any", label: "Any" }, { key: "yes", label: "Attached" }, { key: "no", label: "Missing" }]} />
            </FilterGroup>
            {servicePeriods.length > 0 && (
              <FilterGroup title="Service period">
                <ChoiceChips options={[{ key: "all", label: "All" }, ...servicePeriods.map((p) => ({ key: p.id, label: p.name }))]}
                  selected={new Set([f.period])} onToggle={(period) => setF({ ...f, period })} />
              </FilterGroup>
            )}
            <FilterGroup title="Note">
              <Segmented value={f.note} onChange={(note) => setF({ ...f, note })} options={[{ key: "any", label: "Any" }, { key: "yes", label: "Has a note" }]} />
            </FilterGroup>
          </FilterPanel>
        }
        sort={<SortMenu options={sortOptions} value={sortKey} onChange={setSortKey} />}
        columns={<ColumnsMenu selected={columns} onToggle={toggleColumn} />}
        onDownload={download} downloadLabel="Download as spreadsheet (CSV)"
        chips={chips}
        onClear={() => { setF(EMPTY); setSearch(""); }}
      />

      <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Daily records table">
        <table className="sales-table" aria-label="Daily records">
          <colgroup>
            <col className="sales-col-date" />
            {!singleVenue && <col className="sales-col-venue" />}
            <col className="sales-col-guests" /><col className="sales-col-sales" />
            {shownColumns.map((c) => <col key={c.key} className={`sales-col-${c.key}`} />)}
            <col className="sales-col-status" />
          </colgroup>
          <thead><tr>
            {([{ key: "date", label: "Date" }, ...(!singleVenue ? [{ key: "venue", label: "Venue" }] : []), { key: "guests", label: "Guests" }, { key: "sales", label: "Sales" }, ...shownColumns] as { key: SortKey; label: string }[]).map((c) => <th key={c.key} scope="col" className={c.key === "date" || c.key === "venue" ? "sales-cell-left" : "sales-cell-right"} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
              <Button variant="ghost" className="sales-header-button" onClick={() => headerSort(c.key)}>{c.label}{arrow(c.key)}</Button>
            </th>)}
            <th scope="col" className="sales-cell-right">Status</th>
          </tr></thead>
          <tbody>
          {neverTraded.filter((v) => !search.trim() || v.name.toLowerCase().includes(search.trim().toLowerCase())).map((v) => <tr key={`new-${v.id}`} className="sales-quiet-row">
            <td colSpan={colCount} className={colSpanClass}><div className="sales-message-content"><span>{v.name} has no sales recorded yet</span>{onAddDay && <Button variant="outline" className="kit-btn kit-btn-secondary h-8" onClick={() => onAddDay(to < today ? to : today, v.name)}>Add</Button>}</div></td>
          </tr>)}
          {visible.length === 0 && <tr><td colSpan={colCount} className="sales-empty">No days match. Try clearing the filters.</td></tr>}
          {visible.map((x) => {
            const date = x.kind === "record" ? x.r.date : x.m.date;
            const wk = showWeeks ? weekLabel(date, today) : "";
            const heading = showWeeks && wk !== lastWeek ? wk : null;
            lastWeek = wk;
            const key = x.kind === "record" ? (x.r.id ?? `${x.r.date}-${x.r.venue}-${x.r.reportNumber}`) : `missing-${x.m.venueId}-${x.m.date}`;
            return (
              <React.Fragment key={key}>
                {heading && <tr className="sales-week-row"><th scope="rowgroup" colSpan={colCount}><span className="kit-group-h">{heading}</span></th></tr>}
                {x.kind === "missing" ? (
                  <tr className="sales-missing-row"><td colSpan={colCount} className={colSpanClass}>
                    <div className="sales-message-content"><span>{missingRunLabel(x.m)}</span>
                      {onAddDay && <Button variant="outline" className="kit-btn kit-btn-secondary h-8" onClick={() => onAddDay(date, x.m.venue)}>Add</Button>}
                    </div>
                  </td></tr>
                ) : (
                  <tr className={`sales-record-row ${x.ok ? "" : "sales-attention-row"} ${openId === x.r.id ? "sales-open-row" : ""}`} tabIndex={0} onClick={() => onOpen(x.r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(x.r); } }} aria-label={`${shortDay(date)} ${x.r.venue}`}>
                    <td className="sales-cell-left">{shortDay(date)}</td>
                    {!singleVenue && <td className="sales-cell-left" title={`${x.r.venue}${periodName(x.r.servicePeriodId) ? ` · ${periodName(x.r.servicePeriodId)}` : ""}`}>{x.r.venue}{periodName(x.r.servicePeriodId) ? ` · ${periodName(x.r.servicePeriodId)}` : ""}</td>}
                    <td className="kit-num">{formatTableInteger(x.r.guests)}</td>
                    <td className="kit-num">{hkd0(x.r.totalSales)}</td>
                    {shownColumns.map((c) => { const value = extraValue(x.r, c.key); return <td key={c.key} className="kit-num" title={String(value)}>{typeof value === "string" ? value || "—" : c.key === "orders" ? formatTableInteger(value) : hkd0(value)}</td>; })}
                    <td><div className="sales-status-content">
                      {x.ok ? <StatusPill tone="ok" /> : <StatusPill tone="problem">Doesn't add up</StatusPill>}
                      {x.r.receiptFileUrl && <Receipt className="h-3.5 w-3.5" aria-label="Receipt attached" />}
                      {x.notes.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[12px]" aria-label={`${x.notes.length} notes`}>
                          <MessageSquare className="h-3.5 w-3.5" />{x.notes.length}
                        </span>
                      )}
                    </div></td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
