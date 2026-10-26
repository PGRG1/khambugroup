import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MessageSquare, Receipt } from "lucide-react";
import type { SalesRecord } from "@/types/sales";
import type { SalesNote } from "@/hooks/useSalesNotes";
import { ChoiceChips, ColumnsMenu, FilterGroup, FilterPanel, QuickFilter, Segmented, SortMenu, StatusPill, Toolbar, type ActiveChip } from "@/components/kit";
import { checkRecord, missingRuns, runLabel, shortDay, weekLabel, type MissingRun } from "@/utils/salesRecordChecks";
import { toast } from "sonner";

type SortKey = "date" | "sales" | "guests" | "venue";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type Show = "all" | "attention" | "good";
type Any3 = "any" | "yes" | "no";
interface Filters { show: Show; days: Set<string>; min: string; max: string; receipt: Any3; period: string; note: "any" | "yes" }
const EMPTY: Filters = { show: "all", days: new Set(), min: "", max: "", receipt: "any", period: "all", note: "any" };
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dowOf = (iso: string) => shortDay(iso).slice(0, 3);
export const hkd0 = (v: number) => `${v < 0 ? "-" : ""}HK$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

type Row = { kind: "record"; r: SalesRecord; ok: boolean; notes: SalesNote[] } | { kind: "missing"; m: MissingRun };

type ColKey = "orders" | "subtotal" | "service" | "discount" | "report" | "period" | "cards" | "wallets" | "cash" | "delivery";
const COLS: { key: ColKey; label: string; head: string; num: boolean; w: number }[] = [
  { key: "orders", label: "Orders", head: "Orders", num: true, w: 80 },
  { key: "subtotal", label: "Food & drink (subtotal)", head: "Food & drink", num: true, w: 120 },
  { key: "service", label: "Service charge", head: "Service charge", num: true, w: 120 },
  { key: "discount", label: "Discounts", head: "Discounts", num: true, w: 110 },
  { key: "report", label: "Report #", head: "Report #", num: true, w: 100 },
  { key: "period", label: "Service period", head: "Service period", num: false, w: 120 },
  { key: "cards", label: "Cards total", head: "Cards", num: true, w: 110 },
  { key: "wallets", label: "E-wallets total", head: "E-wallets", num: true, w: 110 },
  { key: "cash", label: "Cash", head: "Cash", num: true, w: 100 },
  { key: "delivery", label: "Delivery platforms total", head: "Delivery", num: true, w: 110 },
];
const COLS_KEY = "sales-records-columns";
function loadCols(uid: string): Set<ColKey> {
  try { const v = JSON.parse(localStorage.getItem(`${COLS_KEY}:${uid}`) || "[]"); return new Set((Array.isArray(v) ? v : []).filter((k: string) => COLS.some((c) => c.key === k))); } catch { return new Set(); }
}
function saveCols(uid: string, s: Set<ColKey>) { try { localStorage.setItem(`${COLS_KEY}:${uid}`, JSON.stringify([...s])); } catch { /* ignore */ } }

export interface DailyRecordsProps {
  records: SalesRecord[];
  /** All records for the chosen venues (any date), used to find each venue's first sale. */
  allRecords?: SalesRecord[];
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

export function DailyRecords({ records, allRecords, userId = "anon", venues, from, to, today, periodLabel, tenantName, notesByRecord, servicePeriods, openId, onOpen, onAddDay }: DailyRecordsProps) {
  const [search, setSearch] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const singleVenue = venues.length === 1;
  const periodName = (id?: string | null) => (id ? servicePeriods.find((p) => p.id === id)?.name : undefined);

  const missing = useMemo(() => missingRuns(records, allRecords ?? records, venues, from, to, today), [records, allRecords, venues, from, to, today]);
  const allRows = useMemo<Row[]>(() => {
    const rs: Row[] = records.map((r) => ({ kind: "record", r, ok: checkRecord(r).ok, notes: (r.id && notesByRecord.get(r.id)) || [] }));
    const ms: Row[] = missing.runs.map((m) => ({ kind: "missing", m }));
    return [...rs, ...ms];
  }, [records, missing, notesByRecord]);
  const [cols, setCols] = useState<Set<ColKey>>(() => loadCols(userId));
  useEffect(() => { setCols(loadCols(userId)); }, [userId]);
  const toggleCol = (k: ColKey) => setCols((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); saveCols(userId, n); return n; });
  const extra = COLS.filter((c) => cols.has(c.key));

  const attentionCount = allRows.filter((x) => x.kind === "missing" || !x.ok).length;
  const dayCount = new Set(records.map((r) => r.date)).size;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = f.min === "" ? null : Number(f.min), max = f.max === "" ? null : Number(f.max);
    const pass = (x: Row) => {
      const date = x.kind === "record" ? x.r.date : x.m.start;
      const attn = x.kind === "missing" || !x.ok;
      if (f.show === "attention" && !attn) return false;
      if (f.show === "good" && attn) return false;
      if (f.days.size && x.kind === "record" && !f.days.has(dowOf(date))) return false;
      if (x.kind === "missing") {
        if (min != null || max != null || f.receipt !== "any" || f.period !== "all" || f.note !== "any") return false;
        return !q || `${date} ${x.m.end} ${runLabel(x.m)} ${x.m.venue} no sales`.toLowerCase().includes(q);
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
      if (sort.key === "date") return x.kind === "record" ? x.r.date : x.m.end;
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
  const visibleDays = new Set(visible.flatMap((x) => (x.kind === "record" ? [x.r.date] : []))).size;

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

  const showWeeks = sort.key === "date";
  let lastWeek = "";
  const pName = (r: SalesRecord) => periodName(r.servicePeriodId);
  const cell = (k: ColKey, r: SalesRecord): string => {
    const n = (v: number) => Math.round(v).toLocaleString("en-US");
    switch (k) {
      case "orders": return n(r.orders);
      case "subtotal": return hkd0(r.subtotal);
      case "service": return hkd0(r.serviceCharge);
      case "discount": return hkd0(-Math.abs(r.discount));
      case "report": return r.reportNumber || "—";
      case "period": return pName(r) ?? "—";
      case "cards": return hkd0(r.visa + r.mastercard + r.amex + r.unionPay + r.jcb);
      case "wallets": return hkd0(r.alipay + r.wechat + r.payme);
      case "cash": return hkd0(r.cash);
      case "delivery": return hkd0((r.deliveroo ?? 0) + (r.foodpanda ?? 0) + (r.keeta ?? 0));
    }
  };
  const W = { date: 104, venue: 190, guests: 80, sales: 112, status: 150 };
  const colCount = 4 + (singleVenue ? 0 : 1) + extra.length;
  const minWidth = W.date + (singleVenue ? 0 : W.venue) + W.guests + W.sales + W.status + extra.reduce((s, c) => s + c.w, 0);
  const Th = ({ k, label, num }: { k?: SortKey; label: string; num?: boolean }) => (
    <th scope="col" className={num ? "num" : ""} aria-sort={k && sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      {k ? <button type="button" onClick={() => headerSort(k)}>{label} {arrow(k)}</button> : label}
    </th>
  );
  const showNever = f.show !== "attention" && missing.neverSold.length > 0;

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
        columns={<ColumnsMenu options={COLS.map((c) => ({ key: c.key, label: c.label }))} selected={cols} onToggle={toggleCol} />}
        onDownload={download} downloadLabel="Download as spreadsheet (CSV)"
        chips={chips}
        onClear={() => { setF(EMPTY); setSearch(""); }}
      />

      <div className="kit kit-table-wrap -mx-1">
        <table className="kit-table" style={{ minWidth }} aria-label="Daily records">
          <colgroup>
            <col style={{ width: W.date }} />
            {!singleVenue && <col style={{ width: W.venue }} />}
            <col style={{ width: W.guests }} />
            <col style={{ width: W.sales }} />
            {extra.map((c) => <col key={c.key} style={{ width: c.w }} />)}
            <col style={{ width: W.status }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky-col" aria-sort={sort.key === "date" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                <button type="button" onClick={() => headerSort("date")}>Date {arrow("date")}</button>
              </th>
              {!singleVenue && <Th k="venue" label="Venue" />}
              <Th k="guests" label="Guests" num />
              <Th k="sales" label="Sales" num />
              {extra.map((c) => <Th key={c.key} label={c.head} num={c.num} />)}
              <th scope="col" className="num"><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody>
            {showNever && missing.neverSold.map((v) => (
              <tr key={`never-${v.id}`} className="missing">
                <td colSpan={colCount} className="sticky-col !overflow-visible">
                  <span className="text-[13px]" style={{ color: "#55605A" }}>{v.name} has no sales recorded yet</span>
                </td>
                <td className="num">
                  {onAddDay && <button type="button" className="kit-btn kit-btn-secondary !h-8" onClick={() => onAddDay(addDefaultDate(today), v.name)}>Add</button>}
                </td>
              </tr>
            ))}
            {visible.length === 0 && !showNever && (
              <tr><td colSpan={colCount + 1} className="text-center text-muted-foreground !h-24">No days match. Try clearing the filters.</td></tr>
            )}
            {visible.map((x) => {
              const date = x.kind === "record" ? x.r.date : x.m.end;
              const wk = showWeeks ? weekLabel(date, today) : "";
              const heading = showWeeks && wk !== lastWeek ? wk : null;
              lastWeek = wk;
              const key = x.kind === "record" ? (x.r.id ?? `${x.r.date}-${x.r.venue}-${x.r.reportNumber}`) : `missing-${x.m.venueId}-${x.m.start}`;
              return (
                <React.Fragment key={key}>
                  {heading && <tr className="group"><td colSpan={colCount + 1}>{heading}</td></tr>}
                  {x.kind === "missing" ? (
                    <tr className="missing">
                      <td colSpan={colCount} className="sticky-col">
                        <span style={{ color: "#55605A" }}>{x.m.venue} · No sales {runLabel(x.m)}</span>
                      </td>
                      <td className="num">
                        {onAddDay && <button type="button" className="kit-btn kit-btn-secondary !h-8" onClick={() => onAddDay(x.m.start, x.m.venue)}>Add</button>}
                      </td>
                    </tr>
                  ) : (
                    <tr className={`data ${x.ok ? "" : "attention"} ${openId === x.r.id ? "open" : ""}`} tabIndex={0}
                      onClick={() => onOpen(x.r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(x.r); } }}>
                      <td className="sticky-col">{shortDay(date)}</td>
                      {!singleVenue && <td title={x.r.venue}>{x.r.venue}{pName(x.r) ? ` · ${pName(x.r)}` : ""}</td>}
                      <td className="num">{Math.round(x.r.guests).toLocaleString("en-US")}</td>
                      <td className="num">{hkd0(x.r.totalSales)}</td>
                      {extra.map((c) => <td key={c.key} className={c.num ? "num" : ""}>{cell(c.key, x.r)}</td>)}
                      <td className="num">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {x.ok ? <StatusPill tone="ok" /> : <StatusPill tone="problem">Doesn't add up</StatusPill>}
                          {x.r.receiptFileUrl && <Receipt className="h-3.5 w-3.5" aria-label="Receipt attached" style={{ color: "var(--kit-muted)" }} />}
                          {x.notes.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[12px]" style={{ color: "var(--kit-muted)" }} aria-label={`${x.notes.length} notes`}>
                              <MessageSquare className="h-3.5 w-3.5" />{x.notes.length}
                            </span>
                          )}
                        </span>
                      </td>
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

/** Default date for a venue with no sales yet: yesterday. */
function addDefaultDate(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
