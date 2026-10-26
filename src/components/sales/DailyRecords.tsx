import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MessageSquare, Receipt } from "lucide-react";
import type { SalesRecord } from "@/types/sales";
import type { SalesNote } from "@/hooks/useSalesNotes";
import { ChoiceChips, FilterGroup, FilterPanel, ListRow, QuickFilter, Segmented, SortMenu, StatusPill, Toolbar, type ActiveChip } from "@/components/kit";
import { checkRecord, missingDays, shortDay, weekLabel, type MissingDay } from "@/utils/salesRecordChecks";
import { formatCurrency } from "@/utils/format";
import { toast } from "sonner";

type SortKey = "date" | "sales" | "guests" | "venue";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type Show = "all" | "attention" | "good";
type Any3 = "any" | "yes" | "no";
interface Filters { show: Show; days: Set<string>; min: string; max: string; receipt: Any3; period: string; note: "any" | "yes" }
const EMPTY: Filters = { show: "all", days: new Set(), min: "", max: "", receipt: "any", period: "all", note: "any" };
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dowOf = (iso: string) => shortDay(iso).slice(0, 3);
const hkd0 = (v: number) => formatCurrency(Math.round(v)).replace(/\.00$/, "");

type Row = { kind: "record"; r: SalesRecord; ok: boolean; notes: SalesNote[] } | { kind: "missing"; m: MissingDay };

export interface DailyRecordsProps {
  records: SalesRecord[];
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

export function DailyRecords({ records, venues, from, to, today, periodLabel, tenantName, notesByRecord, servicePeriods, openId, onOpen, onAddDay }: DailyRecordsProps) {
  const [search, setSearch] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const singleVenue = venues.length === 1;
  const periodName = (id?: string | null) => (id ? servicePeriods.find((p) => p.id === id)?.name : undefined);

  const allRows = useMemo<Row[]>(() => {
    const rs: Row[] = records.map((r) => ({ kind: "record", r, ok: checkRecord(r).ok, notes: (r.id && notesByRecord.get(r.id)) || [] }));
    const ms: Row[] = missingDays(records, venues, from, to, today).map((m) => ({ kind: "missing", m }));
    return [...rs, ...ms];
  }, [records, venues, from, to, today, notesByRecord]);

  const attentionCount = allRows.filter((x) => x.kind === "missing" || !x.ok).length;
  const dayCount = new Set(allRows.map((x) => (x.kind === "record" ? x.r.date : x.m.date))).size;

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
        return !q || `${date} ${shortDay(date)} ${x.m.venue} no sales recorded`.toLowerCase().includes(q);
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
      return sort.key === "sales" ? x.r.totalSales : x.r.guests;
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

  const grid = singleVenue ? "grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_70px_110px_150px]" : "grid-cols-[88px_1fr_auto] sm:grid-cols-[110px_1fr_70px_110px_150px]";
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
        onDownload={download} downloadLabel="Download as spreadsheet (CSV)"
        chips={chips}
        onClear={() => { setF(EMPTY); setSearch(""); }}
      />

      <div className="kit" role="table" aria-label="Daily records">
        <div role="row" className={`grid ${grid} gap-3 px-3 pb-1 text-[12px] font-medium`} style={{ color: "var(--kit-muted)" }}>
          <button type="button" className="flex items-center gap-1 text-left" onClick={() => headerSort("date")}>Date {arrow("date")}</button>
          {!singleVenue && <button type="button" className="flex items-center gap-1 text-left" onClick={() => headerSort("venue")}>Venue {arrow("venue")}</button>}
          <button type="button" className="hidden sm:flex items-center gap-1 justify-end" onClick={() => headerSort("guests")}>Guests {arrow("guests")}</button>
          <button type="button" className="flex items-center gap-1 justify-end" onClick={() => headerSort("sales")}>Sales {arrow("sales")}</button>
          <span className="hidden sm:block" aria-hidden />
        </div>
        {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No days match. Try clearing the filters.</p>}
        <div className="space-y-0.5">
          {visible.map((x) => {
            const date = x.kind === "record" ? x.r.date : x.m.date;
            const wk = showWeeks ? weekLabel(date, today) : "";
            const heading = showWeeks && wk !== lastWeek ? wk : null;
            lastWeek = wk;
            const key = x.kind === "record" ? (x.r.id ?? `${x.r.date}-${x.r.venue}-${x.r.reportNumber}`) : `missing-${x.m.venueId}-${x.m.date}`;
            return (
              <React.Fragment key={key}>
                {heading && <div className="kit-group-h px-3 pt-3 pb-1">{heading}</div>}
                {x.kind === "missing" ? (
                  <ListRow state="missing" className={`grid ${grid} gap-3`}>
                    <span>{shortDay(date)}</span>
                    {!singleVenue && <span className="truncate">{x.m.venue}</span>}
                    <span className="hidden sm:block" />
                    <span className="text-right sm:text-left text-[12px] truncate">No sales recorded</span>
                    <span className="flex justify-end">
                      {onAddDay && <button type="button" className="kit-btn kit-btn-secondary !h-8" onClick={() => onAddDay(date, x.m.venue)}>Add</button>}
                    </span>
                  </ListRow>
                ) : (
                  <ListRow state={x.ok ? "normal" : "attention"} open={openId === x.r.id} onClick={() => onOpen(x.r)} className={`grid ${grid} gap-3`}>
                    <span>{shortDay(date)}</span>
                    {!singleVenue && <span className="truncate">{x.r.venue}{periodName(x.r.servicePeriodId) ? ` · ${periodName(x.r.servicePeriodId)}` : ""}</span>}
                    <span className="hidden sm:block kit-num">{Math.round(x.r.guests).toLocaleString("en-US")}</span>
                    <span className="kit-num">{hkd0(x.r.totalSales)}</span>
                    <span className={`${singleVenue ? "col-span-3" : "col-span-3"} sm:col-span-1 flex items-center justify-end gap-1.5 -mt-1 sm:mt-0`}>
                      {singleVenue && periodName(x.r.servicePeriodId) && <span className="text-[12px] mr-auto sm:hidden" style={{ color: "var(--kit-muted)" }}>{periodName(x.r.servicePeriodId)}</span>}
                      {x.ok ? <StatusPill tone="ok" /> : <StatusPill tone="problem">Doesn't add up</StatusPill>}
                      {x.r.receiptFileUrl && <Receipt className="h-3.5 w-3.5" aria-label="Receipt attached" style={{ color: "var(--kit-muted)" }} />}
                      {x.notes.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[12px]" style={{ color: "var(--kit-muted)" }} aria-label={`${x.notes.length} notes`}>
                          <MessageSquare className="h-3.5 w-3.5" />{x.notes.length}
                        </span>
                      )}
                    </span>
                  </ListRow>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
