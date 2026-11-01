import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { SalesRecord } from "@/types/sales";
import type { SalesNote } from "@/hooks/useSalesNotes";
import { ChoiceChips, FilterGroup, FilterPanel, Segmented, SortMenu, Toolbar, type ActiveChip } from "@/components/kit";
import { addDaysIso, attentionReason, firstSaleDates, missingDays, salesListCounts, shortDay } from "@/utils/salesRecordChecks";
import type { ClosedInfo } from "@/utils/venueClosures";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ColumnsMenu, EXTRA_COLUMNS, columnLabel, type ExtraColumn, type OrderColumn } from "./ColumnsMenu";
import { toast } from "sonner";

type SortKey = "date" | "sales" | "guests" | "venue" | "attention" | ExtraColumn;
type Sort = { key: SortKey; dir: "asc" | "desc" };
type Show = "all" | "attention" | "closed";
type Any3 = "any" | "yes" | "no";
interface Filters { show: Show; days: Set<string>; receipt: Any3; period: string }
const EMPTY: Filters = { show: "all", days: new Set(), receipt: "any", period: "all" };
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dowOf = (iso: string) => shortDay(iso).slice(0, 3);
export const hkd0 = formatTableCurrency;

/** One row of the list; also what the record pop-up opens. */
export type DayItem =
  | { kind: "record"; r: SalesRecord; reason: string | null; notes: SalesNote[]; closed: ClosedInfo | null }
  | { kind: "missing"; date: string; venue: string; venueId: string }
  | { kind: "closed"; date: string; venue: string; venueId: string; info: ClosedInfo };

const itemDate = (x: DayItem) => (x.kind === "record" ? x.r.date : x.date);
const itemVenue = (x: DayItem) => (x.kind === "record" ? x.r.venue : x.venue);
const needsAttention = (x: DayItem) => x.kind === "missing" || (x.kind === "record" && !!x.reason);
export const itemKey = (x: DayItem) => (x.kind === "record" ? (x.r.id ?? `${x.r.date}-${x.r.venue}-${x.r.reportNumber}`) : `${x.kind}-${x.venueId}-${x.date}`);

/** A heading that can be held and dragged sideways; mirrors its offset onto the column's cells via CSS variables. */
function SortableTh({ id, className, ariaSort, tableRef, dragging, children }: {
  id: string; className: string; ariaSort?: "ascending" | "descending"; tableRef: RefObject<HTMLTableElement>; dragging: boolean; children: ReactNode;
}) {
  const { listeners, setNodeRef, transform, transition } = useSortable({ id, transition: { duration: 150, easing: "ease" } });
  const x = transform?.x ?? 0;
  useLayoutEffect(() => {
    const t = tableRef.current; if (!t) return;
    t.style.setProperty(`--tx-${id}`, `${x}px`);
    t.style.setProperty(`--tr-${id}`, transition ?? "none");
  }, [id, x, transition, tableRef]);
  return <th ref={setNodeRef} scope="col" aria-sort={ariaSort} {...listeners}
    className={`${className} sales-movable ${dragging ? "sales-drag-col" : ""}`}
    style={{ transform: `translateX(${x}px)`, transition: transition ?? undefined }}>{children}</th>;
}
const colMove = (k: string) => ({ transform: `translateX(var(--tx-${k}, 0px))`, transition: `var(--tr-${k}, none)` });

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
  closedLookup: (venueId: string, date: string) => ClosedInfo | null;
  openKey: string | null;
  onOpen: (item: DayItem) => void;
  onAddDay?: (date: string, venue: string) => void;
}

export function DailyRecords({ records, history, userId, venues, from, to, today, periodLabel, tenantName, notesByRecord, servicePeriods, closedLookup, openKey, onOpen, onAddDay }: DailyRecordsProps) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const storageKey = userId ? `sales-record-columns:${userId}` : null;
  const [order, setOrder] = useState<OrderColumn[]>(() => {
    const base: OrderColumn[] = ["venue", "guests", "sales"];
    try {
      const saved: unknown = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "null") : null;
      const valid = new Set<string>([...base, ...EXTRA_COLUMNS.map((c) => c.key)]);
      if (Array.isArray(saved)) return [...base, ...EXTRA_COLUMNS.filter((c) => saved.includes(c.key)).map((c) => c.key)];
      if (saved && typeof saved === "object" && Array.isArray((saved as { order?: unknown }).order)) {
        const list = [...new Set(((saved as { order: unknown[] }).order).filter((k): k is OrderColumn => typeof k === "string" && valid.has(k)))];
        for (const b of base) if (!list.includes(b)) list.push(b);
        return list;
      }
    } catch { /* Storage is optional. */ }
    return base;
  });
  const persist = (next: OrderColumn[]) => {
    setOrder(next);
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ order: next })); } catch { /* Storage is optional. */ }
  };
  const toggleColumn = (key: ExtraColumn) => {
    const next = order.includes(key) ? order.filter((c) => c !== key) : [...order, key];
    persist(next);
    if (sort.key === key && !next.includes(key)) setSort({ key: "date", dir: "desc" });
  };
  const singleVenue = venues.length === 1;
  const periodName = (id?: string | null) => (id ? servicePeriods.find((p) => p.id === id)?.name : undefined);
  const firstSales = useMemo(() => firstSaleDates(history), [history]);
  const neverTraded = venues.filter((v) => !firstSales.has(v.name));

  // Closed venue-days in the period (up to today) for venues that have traded.
  const closedItems = useMemo(() => {
    const out: Extract<DayItem, { kind: "closed" }>[] = [];
    const end = to < today ? to : today;
    const have = new Set(records.map((r) => `${r.venue}|${r.date}`));
    for (let d = from; d <= end; d = addDaysIso(d, 1)) for (const v of venues) {
      const first = firstSales.get(v.name);
      if (!first || d < first || have.has(`${v.name}|${d}`)) continue;
      const info = closedLookup(v.id, d);
      if (info) out.push({ kind: "closed", date: d, venue: v.name, venueId: v.id, info });
    }
    return out;
  }, [records, venues, from, to, today, firstSales, closedLookup]);
  const closedSet = useMemo(() => new Set(closedItems.map((c) => `${c.venueId}|${c.date}`)), [closedItems]);
  const missing = useMemo(() => missingDays(records, venues, from, to, today, firstSales, closedSet), [records, venues, from, to, today, firstSales, closedSet]);

  const venueIdOf = (name: string) => venues.find((v) => v.name === name)?.id;
  const extraValue = (r: SalesRecord, key: ExtraColumn): number | string => {
    if (key === "servicePeriod") return periodName(r.servicePeriodId) ?? "";
    if (key === "cards") return r.visa + r.mastercard + r.amex + r.unionPay + r.jcb;
    if (key === "ewallets") return r.alipay + r.wechat + r.payme;
    if (key === "delivery") return (r.deliveroo ?? 0) + (r.foodpanda ?? 0) + (r.keeta ?? 0);
    return r[key];
  };

  const allRows = useMemo<DayItem[]>(() => [
    ...records.map((r): DayItem => {
      const vid = venueIdOf(r.venue);
      return { kind: "record", r, reason: attentionReason(r), notes: (r.id && notesByRecord.get(r.id)) || [], closed: vid ? closedLookup(vid, r.date) : null };
    }),
    ...missing.map((m): DayItem => ({ kind: "missing", ...m })),
    ...closedItems,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [records, missing, closedItems, notesByRecord, closedLookup]);

  const { attention: attentionCount } = salesListCounts(records, missing);

  const visible = useMemo(() => {
    const pass = (x: DayItem) => {
      const date = itemDate(x);
      if (f.show === "attention" && !needsAttention(x)) return false;
      if (f.show === "closed" && x.kind !== "closed") return false;
      if (f.days.size && !f.days.has(dowOf(date))) return false;
      if (x.kind !== "record") return f.receipt === "any" && f.period === "all";
      if (f.receipt === "yes" && !x.r.receiptFileUrl) return false;
      if (f.receipt === "no" && x.r.receiptFileUrl) return false;
      if (f.period !== "all" && x.r.servicePeriodId !== f.period) return false;
      return true;
    };
    const val = (x: DayItem): number | string => {
      if (sort.key === "date") return itemDate(x);
      if (sort.key === "venue") return itemVenue(x);
      if (sort.key === "attention") return needsAttention(x) ? 1 : 0;
      if (x.kind !== "record") return Number.NaN;
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
      if (d !== 0) return d;
      if (sort.key !== "date") { const dd = itemDate(b).localeCompare(itemDate(a)); if (dd) return dd; }
      return itemVenue(a).localeCompare(itemVenue(b));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, f, sort, servicePeriods]);

  // ---- sort ----
  const sortOptions: { key: string; label: string }[] = [
    { key: "date-desc", label: "Newest first" }, { key: "date-asc", label: "Oldest first" },
    { key: "sales-desc", label: "Highest sales" }, { key: "sales-asc", label: "Lowest sales" },
    { key: "guests-desc", label: "Most guests" }, { key: "attention-desc", label: "Needs attention first" },
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
  const activeCount = (f.show !== "all" ? 1 : 0) + (f.days.size ? 1 : 0) + (f.receipt !== "any" ? 1 : 0) + (f.period !== "all" ? 1 : 0);
  const chips: ActiveChip[] = [];
  if (f.show !== "all") chips.push({ key: "show", label: f.show === "attention" ? "Needs attention" : "Closed", onRemove: () => setF({ ...f, show: "all" }) });
  if (f.days.size) chips.push({ key: "days", label: DOWS.filter((d) => f.days.has(d)).join(", "), onRemove: () => setF({ ...f, days: new Set() }) });
  if (f.receipt !== "any") chips.push({ key: "receipt", label: f.receipt === "yes" ? "Receipt attached" : "Receipt missing", onRemove: () => setF({ ...f, receipt: "any" }) });
  if (f.period !== "all") chips.push({ key: "period", label: periodName(f.period) ?? "Service period", onRemove: () => setF({ ...f, period: "all" }) });

  // ---- CSV (existing export columns) ----
  const download = () => {
    const recs = visible.filter((x): x is Extract<DayItem, { kind: "record" }> => x.kind === "record").map((x) => x.r);
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

  const shownCols = order.filter((k) => !(singleVenue && k === "venue"));
  const colCount = 2 + shownCols.length;
  const tableRef = useRef<HTMLTableElement>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  const endDrag = (e?: DragEndEvent) => {
    setDragCol(null);
    document.body.style.cursor = "";
    if (!e?.over || e.active.id === e.over.id) return;
    const from = order.indexOf(e.active.id as OrderColumn), to = order.indexOf(e.over.id as OrderColumn);
    if (from >= 0 && to >= 0) persist(arrayMove(order, from, to));
  };
  const dc = (k: string) => (dragCol === k ? " sales-drag-col" : "");
  const leftAligned = (k: OrderColumn) => k === "venue" || k === "servicePeriod" || k === "reportNumber";
  const open = (x: DayItem) => onOpen(x);
  const flag = (reason: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="sales-flag" aria-label={reason} onClick={(e) => e.stopPropagation()}>!</button>
      </TooltipTrigger>
      <TooltipPortal><TooltipContent side="right" sideOffset={6}>{reason}</TooltipContent></TooltipPortal>
    </Tooltip>
  );

  return (
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3" aria-labelledby="daily-records">
      <h2 id="daily-records" className="text-base font-display font-semibold px-1">Daily records</h2>
      <Toolbar
        filter={
          <FilterPanel activeCount={activeCount} onReset={() => setF(EMPTY)} width={340}>
            <FilterGroup title="Show">
              <Segmented value={f.show} onChange={(show) => setF({ ...f, show })}
                options={[{ key: "all", label: "All" }, { key: "attention", label: "Needs attention" }, { key: "closed", label: "Closed" }]} />
            </FilterGroup>
            {servicePeriods.length > 0 && (
              <FilterGroup title="Service period">
                <ChoiceChips options={[{ key: "all", label: "All" }, ...servicePeriods.map((p) => ({ key: p.id, label: p.name }))]}
                  selected={new Set([f.period])} onToggle={(period) => setF({ ...f, period })} />
              </FilterGroup>
            )}
            <FilterGroup title="Days of the week">
              <ChoiceChips options={DOWS.map((d) => ({ key: d, label: d }))} selected={f.days}
                onToggle={(d) => { const days = new Set(f.days); days.has(d) ? days.delete(d) : days.add(d); setF({ ...f, days }); }} />
            </FilterGroup>
            <FilterGroup title="Receipt">
              <Segmented value={f.receipt} onChange={(receipt) => setF({ ...f, receipt })}
                options={[{ key: "any", label: "Any" }, { key: "yes", label: "Attached" }, { key: "no", label: "Missing" }]} />
            </FilterGroup>
          </FilterPanel>
        }
        sort={<SortMenu options={sortOptions} value={sortKey} onChange={setSortKey} />}
        columns={<ColumnsMenu order={order} onToggle={toggleColumn} onReorder={persist} venueLocked={singleVenue} />}
        onDownload={download} downloadLabel="Download as spreadsheet (CSV)"
        chips={chips}
        onClear={() => setF(EMPTY)}
      />
      {attentionCount > 0 && f.show !== "attention" && (
        <p className="kit text-[13px] px-1" style={{ color: "var(--kit-ink)" }}>
          <strong>{attentionCount} {attentionCount === 1 ? "day needs" : "days need"} you</strong> · <button type="button" className="kit-link" onClick={() => setF({ ...f, show: "attention" })}>Show them</button>
        </p>
      )}

      <TooltipProvider delayDuration={150}>
      <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Daily records table">
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={(e) => { setDragCol(String(e.active.id)); document.body.style.cursor = "grabbing"; }}
          onDragEnd={endDrag} onDragCancel={() => endDrag()}>
        <table ref={tableRef} className="sales-table" aria-label="Daily records">
          <colgroup>
            <col className="sales-col-flag" />
            <col className="sales-col-date" />
            {shownCols.map((k) => <col key={k} className={`sales-col-${k}`} />)}
          </colgroup>
          <thead><tr>
            <th scope="col" className="sales-flag-cell"><span className="sr-only">Needs attention</span></th>
            {(() => {
              const al = (k: string) => (k === "date" || leftAligned(k as OrderColumn) ? "sales-cell-left" : "sales-cell-right");
              const aSort = (k: string) => (sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined) as "ascending" | "descending" | undefined;
              const btn = (k: SortKey, label: string) => <button type="button" className="sales-header-button" onClick={() => headerSort(k)}>{label}{arrow(k)}</button>;
              return <>
                <th scope="col" className={al("date")} aria-sort={aSort("date")}>{btn("date", "Date")}</th>
                <SortableContext items={shownCols} strategy={horizontalListSortingStrategy}>
                  {shownCols.map((k) => <SortableTh key={k} id={k} className={al(k)} ariaSort={aSort(k)} tableRef={tableRef} dragging={dragCol === k}>{btn(k as SortKey, columnLabel(k))}</SortableTh>)}
                </SortableContext>
              </>;
            })()}
          </tr></thead>
          <tbody>
          {neverTraded.map((v) => <tr key={`new-${v.id}`} className="sales-quiet-row">
            <td colSpan={colCount} className="sales-message-cell"><div className="sales-message-content"><span>{v.name} has no sales recorded yet</span>{onAddDay && <Button variant="outline" className="kit-btn kit-btn-secondary h-8" onClick={() => onAddDay(to < today ? to : today, v.name)}>Add</Button>}</div></td>
          </tr>)}
          {visible.length === 0 && <tr><td colSpan={colCount} className="sales-empty">No days match. Try clearing the filters.</td></tr>}
          {visible.map((x) => {
            const date = itemDate(x);
            const key = itemKey(x);
            const attn = needsAttention(x);
            const cls = `sales-record-row ${attn ? "sales-attention-row" : ""} ${x.kind === "closed" ? "sales-closed-row" : ""}`;
            const venueLabel = x.kind === "record" ? `${x.r.venue}${periodName(x.r.servicePeriodId) ? ` · ${periodName(x.r.servicePeriodId)}` : ""}` : x.venue;
            return (
              <tr key={key} className={cls} tabIndex={0} onClick={() => open(x)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(x); } }}
                aria-label={`${shortDay(date)} ${itemVenue(x)}`}>
                <td className="sales-flag-cell">
                  {x.kind === "missing" && flag("No sales recorded")}
                  {x.kind === "record" && x.reason && flag(x.reason)}
                </td>
                <td className="sales-cell-left">{shortDay(date)}</td>
                {shownCols.map((k) => {
                  if (k === "venue") return <td key={k} style={colMove(k)} className={`sales-cell-left${dc(k)}`} title={venueLabel}>{venueLabel}</td>;
                  if (x.kind !== "record") {
                    if (k === "guests") return <td key={k} style={colMove(k)} className={`kit-num${dc(k)}`}>—</td>;
                    if (k === "sales") return <td key={k} style={colMove(k)} className={`kit-num${dc(k)} ${x.kind === "missing" ? "sales-nosales" : ""}`}>{x.kind === "missing" ? "No sales" : "Closed"}</td>;
                    return <td key={k} style={colMove(k)} className={dc(k)} />;
                  }
                  if (k === "guests") return <td key={k} style={colMove(k)} className={`kit-num${dc(k)}`}>{formatTableInteger(x.r.guests)}</td>;
                  if (k === "sales") return <td key={k} style={colMove(k)} className={`kit-num${dc(k)}`}>{hkd0(x.r.totalSales)}</td>;
                  const value = extraValue(x.r, k);
                  return <td key={k} style={colMove(k)} className={`${leftAligned(k) ? "sales-cell-left" : "kit-num"}${dc(k)}`} title={String(value)}>{typeof value === "string" ? value || "—" : k === "orders" ? formatTableInteger(value) : hkd0(value)}</td>;
                })}
              </tr>
            );
          })}
          </tbody>
        </table>
        </DndContext>
      </div>
      </TooltipProvider>
    </section>
  );
}
