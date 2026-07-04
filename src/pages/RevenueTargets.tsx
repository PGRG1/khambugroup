import React, { useMemo, useState, useCallback } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from "recharts";
import {
  Calendar, ChevronLeft, ChevronRight, Download,
  ChevronDown, ChevronRight as ChevronR, Plus, Sparkles, RefreshCw,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { useRevenueTargetDays } from "@/hooks/useRevenueTargetDays";
import { useRevenueManagerTargetLines } from "@/hooks/useRevenueManagerTargetLines";
import { useRevenueStatisticalTargetsDaily } from "@/hooks/useRevenueStatisticalTargetsDaily";
import { useRevenueTargetActuals } from "@/hooks/useRevenueTargetActuals";
import { useRevenueTargetFilters } from "@/hooks/useRevenueTargetFilters";
import { useRevenueTargetAnalytics } from "@/hooks/useRevenueTargetAnalytics";
import { useRevenueTargetPermissions } from "@/hooks/useRevenueTargetPermissions";
import { useRevenueTargetMutations, validateManagerLine } from "@/hooks/useRevenueTargetMutations";
import {
  aggregateManager, managerRevenue, decomposeVariance, isOperationalLine, isAdditiveEvent,
} from "@/utils/revenueTargetAnalytics";
import type {
  ManagerTargetLine, OperatingStatus, VenueServicePeriod, EventMode,
} from "@/types/revenueTargetsV2";
import { AdjustmentReasonDialog, type AdjustmentReasonKind } from "@/components/revenue-targets/AdjustmentReasonDialog";

// ---------- Design tokens (semantic HSL only) ----------
const C = {
  stat:    "hsl(var(--chart-8))",   // slate — reference, recedes
  manager: "hsl(var(--primary))",   // copper — brand, our plan
  actual:  "hsl(var(--chart-3))",   // teal — verified reality
  pos:     "hsl(var(--success))",
  neg:     "hsl(var(--destructive))",
  grid:    "hsl(var(--border))",
  muted:   "hsl(var(--muted-foreground))",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STATUSES: OperatingStatus[] = ["normal", "mixed", "events_only", "closed"];

const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });
const fmtHKD = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : `HK$ ${formatCurrency(Number(v))}`;
const fmtInt = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(Number(v)).toLocaleString("en-US");
const fmtPct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;
const isoDate = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// ---------- Small primitives ----------
function SectionCard({
  title, right, children, className = "",
}: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-4 bg-card border-border ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <div className="text-sm font-semibold tracking-tight text-foreground">{title}</div>}
          {right}
        </div>
      )}
      {children}
    </Card>
  );
}

function KpiCard({
  label, value, hint, tone = "default",
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "primary" }) {
  return (
    <Card
      className={`p-4 border-border ${
        tone === "primary"
          ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20"
          : "bg-card"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function KpiCardDot({
  dot, label, value, hint,
}: { dot: string; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="p-3 border-border bg-card">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function StatusChip({ s }: { s: OperatingStatus }) {
  const map: Record<OperatingStatus, string> = {
    normal: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    mixed: "bg-sky-500/15 text-sky-500 border-sky-500/30",
    events_only: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    closed: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  };
  const label: Record<OperatingStatus, string> = {
    normal: "Normal", mixed: "Mixed", events_only: "Events Only", closed: "Closed",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${map[s]}`}>
      {label[s]}
    </span>
  );
}

// ---------- Toolbar primitives (private) ----------
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] text-muted-foreground uppercase tracking-wide mr-1">
      {children}
    </span>
  );
}

function ToolbarDivider() {
  return <span className="h-5 w-px bg-border mx-1" aria-hidden />;
}

function PillToggle({
  active, onClick, variant = "outlined", children,
}: {
  active: boolean;
  onClick: () => void;
  variant?: "outlined" | "filled";
  children: React.ReactNode;
}) {
  const base = "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap";
  const styles = variant === "filled"
    ? (active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-transparent border-border text-muted-foreground hover:text-foreground")
    : (active
        ? "border-primary text-primary bg-primary/10"
        : "border-border text-muted-foreground hover:text-foreground");
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function LinkToggle({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs whitespace-nowrap transition-colors ${
        active
          ? "text-primary font-medium underline underline-offset-4"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}


// ---------- Main page ----------
export default function RevenueTargets() {
  const { venue: routeVenue } = useParams<{ venue: string }>();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  const { filters, setMonth, setVenues, setPeriods, setWeekdays, setStatuses } =
    useRevenueTargetFilters({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const { year, month, venueIds, servicePeriodIds, weekdays, operatingStatuses } = filters;

  const { venues, loading: venuesLoading } = useVenues();
  const activeVenues = useMemo(
    () => venues.filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [venues],
  );

  // Empty venueIds ("All" in the filter) = every active venue. The route slug
  // is only used to seed the initial single-venue selection once, via the effect below.
  const effectiveVenueIds = useMemo(() => {
    if (venueIds.length) return venueIds;
    return activeVenues.map((v) => v.id);
  }, [venueIds, activeVenues]);

  // Seed venueIds from the route slug once venues have loaded, so the picker
  // reflects the venue in the URL. User can then switch to "All" to clear it.
  const seededFromRoute = React.useRef(false);
  React.useEffect(() => {
    if (seededFromRoute.current) return;
    if (!activeVenues.length || !routeVenue || venueIds.length) return;
    const match = activeVenues.find((v) =>
      v.name.toLowerCase().replace(/\s+/g, "-") === routeVenue.toLowerCase());
    if (match) {
      setVenues([match.id]);
      seededFromRoute.current = true;
    }
  }, [activeVenues, routeVenue, venueIds.length, setVenues]);

  const perms = useRevenueTargetPermissions();
  const canEdit = perms.canEditManagerTargets;

  // Data hooks
  const { rows: allPeriods, operational: opPeriods, refetch: refetchPeriods } =
    useVenueServicePeriods(effectiveVenueIds);
  const { rows: days, refetch: refetchDays } =
    useRevenueTargetDays(year, month, effectiveVenueIds);
  const { rows: managerLines, refetch: refetchLines, ensureMonth } =
    useRevenueManagerTargetLines(year, month, effectiveVenueIds);
  const { rows: statistical, generate: generateStatistical, generating: generatingStat } =
    useRevenueStatisticalTargetsDaily(year, month, effectiveVenueIds);
  const { rows: actuals, byPeriod: actualsByPeriod } = useRevenueTargetActuals(year, month, effectiveVenueIds);
  const mutations = useRevenueTargetMutations();

  // Filter operating statuses at dailyPoint level via revenue_target_days lookup
  const dayStatusByKey = useMemo(() => {
    const m = new Map<string, OperatingStatus>();
    for (const d of days) m.set(`${d.venueId}__${d.targetDate}`, d.operatingStatus);
    return m;
  }, [days]);

  const analytics = useRevenueTargetAnalytics({
    year, month, venueIds: effectiveVenueIds,
    managerLines, statistical, actuals, periods: allPeriods,
    weekdays, servicePeriodIds,
    asOfDate: today.toISOString().slice(0, 10),
  });

  // Apply operating-status filter after analytics (client-side)
  const filteredPoints = useMemo(() => {
    if (!operatingStatuses.length) return analytics.points;
    const set = new Set(operatingStatuses);
    return analytics.points.filter((p) => {
      const s = dayStatusByKey.get(`${p.venueId}__${p.date}`) ?? "normal";
      return set.has(s);
    });
  }, [analytics.points, operatingStatuses, dayStatusByKey]);

  const asOf = today.toISOString().slice(0, 10);
  const completedDays = filteredPoints.filter((p) => p.date <= asOf).length;
  const remainingDays = filteredPoints.filter((p) => p.date > asOf).length;

  // Rebuild rollups after status filter
  const monthly = useMemo(() => {
    let mRev = 0, mG = 0, aRev = 0, aG = 0, sRev = 0, sG = 0;
    let mRevToDate = 0, mGToDate = 0, sRevToDate = 0, sGToDate = 0;
    for (const p of filteredPoints) {
      mRev += p.managerRevenue; mG += p.managerGuests;
      if (p.actual) { aRev += p.actual.revenue; aG += p.actual.guests; }
      if (p.statistical) {
        sRev += Number(p.statistical.statisticalTargetAmount ?? 0);
        sG += Number(p.statistical.statisticalGuestTarget ?? 0);
      }
      if (p.date <= asOf) {
        mRevToDate += p.managerRevenue;
        mGToDate += p.managerGuests;
        if (p.statistical) {
          sRevToDate += Number(p.statistical.statisticalTargetAmount ?? 0);
          sGToDate += Number(p.statistical.statisticalGuestTarget ?? 0);
        }
      }
    }
    const actualSpg = aG > 0 ? aRev / aG : null;
    return {
      managerRevenue: mRev, managerGuests: mG,
      actualRevenue: aRev, actualGuests: aG,
      statRevenue: sRev, statGuests: sG,
      actualSpg,
      managerSpg: mG > 0 ? mRev / mG : null,
      statSpg: sG > 0 ? sRev / sG : null,
      managerRevenueToDate: mRevToDate,
      managerGuestsToDate: mGToDate,
      statRevenueToDate: sRevToDate,
      statGuestsToDate: sGToDate,
      actualSpgToDate: actualSpg,
      statSpgToDate: sGToDate > 0 ? sRevToDate / sGToDate : null,
    };
  }, [filteredPoints, asOf]);

  const isFiltered = weekdays.length > 0 || servicePeriodIds.length > 0 || operatingStatuses.length > 0;

  // ---- Section: chart data builders ----
  const dailyChartData = useMemo(() => {
    const byDate = new Map<string, { date: string; stat: number; mgr: number; act: number | null }>();
    for (const p of filteredPoints) {
      const cur = byDate.get(p.date) ?? { date: p.date, stat: 0, mgr: 0, act: null };
      cur.mgr += p.managerRevenue;
      if (p.statistical) cur.stat += Number(p.statistical.statisticalTargetAmount ?? 0);
      if (p.actual) cur.act = (cur.act ?? 0) + p.actual.revenue;
      byDate.set(p.date, cur);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, label: r.date.slice(8) }));
  }, [filteredPoints]);

  const cumulativeData = useMemo(() => {
    let s = 0, m = 0, a = 0;
    return dailyChartData.map((r) => {
      s += r.stat; m += r.mgr; if (r.act != null) a += r.act;
      return { label: r.label, date: r.date, stat: s, mgr: m, act: r.act == null && r.date > asOf ? null : a };
    });
  }, [dailyChartData, asOf]);

  const varianceData = useMemo(() => {
    return dailyChartData
      .filter((r) => r.act != null)
      .map((r) => ({ label: r.label, delta: (r.act ?? 0) - r.mgr }));
  }, [dailyChartData]);

  const guestData = useMemo(() => {
    const byDate = new Map<string, { date: string; stat: number | null; mgr: number; act: number | null }>();
    for (const p of filteredPoints) {
      const cur = byDate.get(p.date) ?? { date: p.date, stat: null, mgr: 0, act: null };
      cur.mgr += p.managerGuests;
      if (p.statistical?.statisticalGuestTarget != null)
        cur.stat = (cur.stat ?? 0) + Number(p.statistical.statisticalGuestTarget);
      if (p.actual) cur.act = (cur.act ?? 0) + p.actual.guests;
      byDate.set(p.date, cur);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, label: r.date.slice(8) }));
  }, [filteredPoints]);

  const spgData = useMemo(() => {
    return dailyChartData.map((r) => {
      const g = guestData.find((x) => x.date === r.date);
      return {
        label: r.label,
        stat: g?.stat ? (r.stat > 0 ? r.stat / g.stat : null) : null,
        mgr: g?.mgr ? (r.mgr > 0 ? r.mgr / g.mgr : null) : null,
        act: r.act != null && g?.act ? r.act / g.act : null,
      };
    });
  }, [dailyChartData, guestData]);

  // MTD-vs-MTD decomposition: only include days that actually completed (have
  // an actuals row). Full-month manager totals vs actuals-to-date would make
  // "Guest Volume" balloon negative simply because future days haven't happened.
  const varianceDrivers = useMemo(() => {
    let mRev = 0, mG = 0, aRev = 0, aG = 0;
    for (const p of filteredPoints) {
      if (!p.actual) continue;
      mRev += p.managerRevenue;
      mG += p.managerGuests;
      aRev += p.actual.revenue;
      aG += p.actual.guests;
    }
    const d = decomposeVariance(aRev, aG, mRev, mG);
    return [
      { label: "Guest Volume", value: d.guestVolumeImpact },
      { label: "Spend per Guest", value: d.spendImpact },
      { label: "Net Variance", value: d.total },
    ];
  }, [filteredPoints]);


  const weekdayRows = useMemo(() => {
    // Group points by weekday, average per occurrence.
    const by = new Map<number, { pts: typeof filteredPoints; rev: number; mgr: number; stat: number; mgrG: number; actG: number; actRev: number; statG: number }>();
    for (const p of filteredPoints) {
      const cur = by.get(p.weekday) ?? { pts: [] as any, rev: 0, mgr: 0, stat: 0, mgrG: 0, actG: 0, actRev: 0, statG: 0 };
      cur.pts.push(p);
      cur.mgr += p.managerRevenue;
      cur.mgrG += p.managerGuests;
      if (p.actual) { cur.actRev += p.actual.revenue; cur.actG += p.actual.guests; }
      if (p.statistical) {
        cur.stat += Number(p.statistical.statisticalTargetAmount ?? 0);
        cur.statG += Number(p.statistical.statisticalGuestTarget ?? 0);
      }
      by.set(p.weekday, cur);
    }
    const rows = [];
    for (let w = 0; w < 7; w++) {
      const g = by.get(w);
      if (!g) continue;
      const n = g.pts.length;
      const nComplete = g.pts.filter((x) => x.actual).length;
      rows.push({
        weekday: w,
        occurrences: n,
        avgStat: n ? g.stat / n : 0,
        avgMgr: n ? g.mgr / n : 0,
        avgAct: nComplete ? g.actRev / nComplete : null,
        avgMgrG: n ? g.mgrG / n : 0,
        avgActG: nComplete ? g.actG / nComplete : null,
        mgrSpg: g.mgrG > 0 ? g.mgr / g.mgrG : null,
        actSpg: g.actG > 0 ? g.actRev / g.actG : null,
        varVsMgr: nComplete ? (g.actRev / nComplete) - (g.mgr / n) : null,
        achievement: nComplete && g.mgr > 0 ? (g.actRev / nComplete) / (g.mgr / n) : null,
      });
    }
    return rows;
  }, [filteredPoints]);

  const venueRows = useMemo(() => {
    const by = new Map<string, { stat: number; mgr: number; act: number }>();
    for (const p of filteredPoints) {
      const cur = by.get(p.venueId) ?? { stat: 0, mgr: 0, act: 0 };
      cur.mgr += p.managerRevenue;
      if (p.statistical) cur.stat += Number(p.statistical.statisticalTargetAmount ?? 0);
      if (p.actual) cur.act += p.actual.revenue;
      by.set(p.venueId, cur);
    }
    return Array.from(by.entries()).map(([id, v]) => {
      const venue = activeVenues.find((av) => av.id === id);
      return { name: venue?.name ?? id, ...v };
    });
  }, [filteredPoints, activeVenues]);

  const servicePeriodMix = useMemo(() => {
    // Manager revenue by service period (operational rows only).
    const by = new Map<string, { name: string; mgr: number }>();
    for (const l of managerLines) {
      if (!isOperationalLine(l, allPeriods)) continue;
      if (l.lineType !== "service_period" || !l.servicePeriodId) continue;
      const sp = allPeriods.find((p) => p.id === l.servicePeriodId);
      if (!sp) continue;
      const cur = by.get(sp.id) ?? { name: sp.name, mgr: 0 };
      cur.mgr += managerRevenue(l) ?? 0;
      by.set(sp.id, cur);
    }
    // Events grouped
    const eventTotal = managerLines
      .filter((l) => isOperationalLine(l, allPeriods) && l.lineType === "event")
      .reduce((a, l) => a + (managerRevenue(l) ?? 0), 0);
    const arr = Array.from(by.values());
    if (eventTotal > 0) arr.push({ name: "Events", mgr: eventTotal });
    return arr;
  }, [managerLines, allPeriods]);

  // Target intelligence
  const intel = useMemo(() => {
    const completed = filteredPoints.filter((p) => p.actual);
    const onTarget = completed.filter((p) => (p.actual?.revenue ?? 0) >= p.managerRevenue && p.managerRevenue > 0).length;
    let best: { date: string; delta: number } | null = null;
    let worst: { date: string; delta: number } | null = null;
    for (const p of completed) {
      const delta = (p.actual?.revenue ?? 0) - p.managerRevenue;
      if (best == null || delta > best.delta) best = { date: p.date, delta };
      if (worst == null || delta < worst.delta) worst = { date: p.date, delta };
    }
    const adjusted = managerLines.filter((l) => l.status !== "draft").length;
    return { onTarget, completed: completed.length, best, worst, adjusted };
  }, [filteredPoints, managerLines]);

  // ---------- Actions ----------
  const handleEnsureMonth = useCallback(async () => {
    if (!effectiveVenueIds.length) return;
    const r = await ensureMonth(effectiveVenueIds);
    if (r.ok) toast({ title: "Draft rows initialized", description: `${r.inserted ?? 0} inserted.` });
  }, [effectiveVenueIds, ensureMonth]);

  const handleRecomputeStat = useCallback(async () => {
    if (!effectiveVenueIds.length) return;
    const g = await generateStatistical(effectiveVenueIds);
    if (g.ok) toast({ title: "Benchmarks recomputed" });
    else toast({ title: "Recompute failed", description: g.error, variant: "destructive" });
  }, [effectiveVenueIds, generateStatistical]);

  const handleSetUpMonth = useCallback(async () => {
    if (!effectiveVenueIds.length) return;
    const g = await generateStatistical(effectiveVenueIds);
    if (!g.ok) { toast({ title: "Set-up failed", description: g.error, variant: "destructive" }); return; }
    const r = await ensureMonth(effectiveVenueIds);
    if (!r.ok) { toast({ title: "Set-up failed", description: "Draft row initialization failed.", variant: "destructive" }); return; }
    toast({
      title: "Month set up",
      description: `Benchmarks generated · ${r.inserted ?? 0} draft target rows created.`,
    });
  }, [effectiveVenueIds, generateStatistical, ensureMonth]);

  const [pendingEdits, setPendingEdits] = useState<Record<string, Partial<ManagerTargetLine>>>({});
  const editLine = (id: string, patch: Partial<ManagerTargetLine>) =>
    setPendingEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // ---- Reason dialog state (replaces window.prompt) ----
  const [reasonReq, setReasonReq] = useState<{
    kind: AdjustmentReasonKind;
    onConfirm: (reason: string) => void | Promise<void>;
  } | null>(null);
  const requestReason = useCallback(
    (kind: AdjustmentReasonKind, onConfirm: (reason: string) => void | Promise<void>) =>
      setReasonReq({ kind, onConfirm }),
    [],
  );

  const linesWithEdits = useMemo(() =>
    managerLines.map((l) => ({ ...l, ...pendingEdits[l.id] })),
    [managerLines, pendingEdits]);

  const EPS = 0.01;
  const resolveManagerSource = (t: ManagerTargetLine): "manual" | "statistical_default" => {
    const s: any = statistical.find(
      (r: any) =>
        r.venueId === t.venueId &&
        r.targetDate === t.targetDate &&
        r.servicePeriodId === t.servicePeriodId,
    );
    const sg = s?.statisticalGuestTarget ?? null;
    const ss = s?.statisticalSpendPerGuest ?? null;
    const g = t.managerGuestTarget;
    const p = t.managerSpendPerGuestTarget;
    const gMatches = g == null || (sg != null && Math.abs(Number(g) - Number(sg)) <= EPS);
    const pMatches = p == null || (ss != null && Math.abs(Number(p) - Number(ss)) <= EPS);
    return gMatches && pMatches ? "statistical_default" : "manual";
  };

  const performSaveDay = async (
    venueId: string, date: string, targets: ManagerTargetLine[], adjustmentReason?: string | null,
  ) => {
    for (const t of targets) {
      const err = validateManagerLine(t, "saved");
      if (err) { toast({ title: "Cannot save", description: err, variant: "destructive" }); return; }
    }
    const r = await mutations.batchUpsertManagerLines(
      targets.map((t) => ({
        id: t.id,
        venueId: t.venueId,
        targetDate: t.targetDate,
        lineType: t.lineType,
        servicePeriodId: t.servicePeriodId,
        targetInputMode: t.targetInputMode,
        managerGuestTarget: t.managerGuestTarget,
        managerSpendPerGuestTarget: t.managerSpendPerGuestTarget,
        managerRevenueOverride: t.managerRevenueOverride,
        lineStatus: t.lineStatus,
        zeroReason: adjustmentReason ?? t.zeroReason,
        status: "saved",
        notes: t.notes,
        managerSource: resolveManagerSource(t),
      })),
    );
    if (r.ok) {
      setPendingEdits((prev) => {
        const next = { ...prev };
        for (const t of targets) delete next[t.id];
        return next;
      });
      await refetchLines();
    }
  };

  // Detect >15% variance vs reliable Full-Day Statistical benchmark for the day.
  const varianceExceedsThreshold = (venueId: string, date: string, targets: ManagerTargetLine[]) => {
    const statRow: any = statistical.find((s: any) => s.venueId === venueId && s.targetDate === date);
    const statRev = Number(statRow?.statisticalTargetAmount ?? 0);
    if (!statRow || !isFinite(statRev) || statRev <= 0) return false;
    // Sum manager revenue across all operational lines for this venue/date (with edits applied).
    const dayLines = linesWithEdits.filter((l) => l.venueId === venueId && l.targetDate === date);
    const agg = aggregateManager(dayLines, allPeriods);
    if (!isFinite(agg.revenue) || agg.revenue <= 0) return false;
    const delta = Math.abs(agg.revenue - statRev) / statRev;
    return delta > 0.15;
  };

  // Detect whether any pending edit diverges from the statistical_default seed baseline
  // (guest target or SPG changed compared to the seeded stat values).
  const divergesFromStatSeed = (targets: ManagerTargetLine[]) => {
    for (const t of targets) {
      const original = managerLines.find((l) => l.id === t.id);
      if (!original) continue;
      if (original.managerSource !== "statistical_default") continue;
      const gChanged = t.managerGuestTarget != null
        && Number(t.managerGuestTarget) !== Number(original.managerGuestTarget ?? NaN);
      const spgChanged = t.managerSpendPerGuestTarget != null
        && Math.abs(Number(t.managerSpendPerGuestTarget) - Number(original.managerSpendPerGuestTarget ?? NaN)) > 0.01;
      if (gChanged || spgChanged) return true;
    }
    return false;
  };

  const saveDay = async (venueId: string, date: string) => {
    const targets = linesWithEdits.filter((l) => l.venueId === venueId && l.targetDate === date && pendingEdits[l.id]);
    if (!targets.length) return;
    if (varianceExceedsThreshold(venueId, date, targets)) {
      requestReason("variance_threshold", async (reason) => {
        setReasonReq(null);
        await performSaveDay(venueId, date, targets, reason);
      });
      return;
    }
    const hasManualOverrideTransition = targets.some((t) => {
      const original = managerLines.find((l) => l.id === t.id);
      const wasDefault = !original || original.managerSource == null || original.managerSource === "statistical_default";
      return wasDefault && resolveManagerSource(t) === "manual";
    });
    if (hasManualOverrideTransition) {
      requestReason("manual_override", async (reason) => {
        setReasonReq(null);
        await performSaveDay(venueId, date, targets, reason);
      });
      return;
    }
    await performSaveDay(venueId, date, targets);
  };

  const saveAll = async () => {
    const ids = Object.keys(pendingEdits);
    if (!ids.length) { toast({ title: "Nothing to save" }); return; }
    const targets = linesWithEdits.filter((l) => pendingEdits[l.id]);
    for (const t of targets) {
      const err = validateManagerLine(t, "saved");
      if (err) { toast({ title: "Cannot save", description: err, variant: "destructive" }); return; }
    }
    const r = await mutations.batchUpsertManagerLines(
      targets.map((t) => ({
        id: t.id,
        venueId: t.venueId,
        targetDate: t.targetDate,
        lineType: t.lineType,
        servicePeriodId: t.servicePeriodId,
        targetInputMode: t.targetInputMode,
        managerGuestTarget: t.managerGuestTarget,
        managerSpendPerGuestTarget: t.managerSpendPerGuestTarget,
        managerRevenueOverride: t.managerRevenueOverride,
        lineStatus: t.lineStatus,
        zeroReason: t.zeroReason,
        status: "saved",
        notes: t.notes,
        managerSource: resolveManagerSource(t),
      })),
    );
    if (r.ok) { setPendingEdits({}); await refetchLines(); }
  };

  const applyStatistical = async (line: ManagerTargetLine, stat: { rev: number | null; g: number | null; spg: number | null }) => {
    if (!stat.g || !stat.spg) {
      toast({ title: "Statistical unavailable", description: "This operational period has no reliable Statistical benchmark.", variant: "destructive" });
      return;
    }
    editLine(line.id, { managerGuestTarget: Math.round(stat.g), managerSpendPerGuestTarget: Number(stat.spg.toFixed(2)) });
  };

  const setOperatingStatus = useCallback(async (venueId: string, date: string, status: OperatingStatus, notes?: string) => {
    // Non-normal statuses require a reason via the reason dialog
    const needsReason = status === "events_only" || status === "closed";
    const commit = async (reason?: string) => {
      const r = await mutations.upsertOperatingStatus(venueId, date, status, reason ?? notes ?? null);
      if (r.ok) { await refetchDays(); toast({ title: "Operating status updated" }); }
    };
    if (needsReason && !notes) {
      const kind: AdjustmentReasonKind = status === "closed" ? "closed" : "events_only";
      requestReason(kind, (reason) => { setReasonReq(null); return commit(reason); });
      return;
    }
    await commit();
  }, [mutations, refetchDays, requestReason]);

  // Approve saved lines for a day (canApprove only)
  const approveDay = useCallback(async (venueId: string, date: string) => {
    const ids = managerLines
      .filter((l) => l.venueId === venueId && l.targetDate === date && l.status === "saved")
      .map((l) => l.id);
    if (!ids.length) { toast({ title: "Nothing to approve", description: "Save the day first." }); return; }
    const r = await mutations.approveLines(ids);
    if (r.ok) await refetchLines();
  }, [managerLines, mutations, refetchLines]);

  const exportCsv = () => {
    const header = ["Date", "Weekday", "Venue", "Statistical Revenue", "Manager Revenue", "Actual Revenue",
      "Manager Guests", "Actual Guests", "Manager SPG", "Actual SPG", "Actual vs Manager"];
    const rows: string[][] = [header];
    for (const p of filteredPoints) {
      const venue = activeVenues.find((v) => v.id === p.venueId)?.name ?? p.venueId;
      rows.push([
        p.date, WEEKDAY_LONG[p.weekday], venue,
        p.statistical?.statisticalTargetAmount?.toString() ?? "",
        p.managerRevenue.toFixed(2),
        p.actual?.revenue?.toFixed(2) ?? "",
        p.managerGuests.toString(),
        p.actual?.guests?.toString() ?? "",
        p.managerGuests > 0 ? (p.managerRevenue / p.managerGuests).toFixed(2) : "",
        p.actual && p.actual.guests > 0 ? (p.actual.revenue / p.actual.guests).toFixed(2) : "",
        p.actual ? (p.actual.revenue - p.managerRevenue).toFixed(2) : "",
      ]);
    }
    const csv = "\ufeff" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-targets-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -------------------- Render --------------------
  return (
    <div className="mx-auto px-6 lg:px-7 py-5 max-w-[1600px] space-y-4">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Revenue Targets</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Set and monitor daily Revenue, Guest and Spend-per-Guest targets by venue, date and service period.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      {/* FILTER BAR — single inline chip toolbar */}
      {(() => {
        // Distinct period names across selected venues (opPeriods already excludes rollup-only)
        const nameToIds = new Map<string, string[]>();
        for (const p of opPeriods) {
          const arr = nameToIds.get(p.name) ?? [];
          arr.push(p.id);
          nameToIds.set(p.name, arr);
        }
        const distinctNames = Array.from(nameToIds.keys()).sort((a, b) => a.localeCompare(b));
        const selectedIdSet = new Set(servicePeriodIds);
        const isNameSelected = (name: string) => {
          const ids = nameToIds.get(name) ?? [];
          return ids.length > 0 && ids.every((id) => selectedIdSet.has(id));
        };
        const toggleName = (name: string) => {
          const ids = nameToIds.get(name) ?? [];
          if (isNameSelected(name)) {
            setPeriods(servicePeriodIds.filter((id) => !ids.includes(id)));
          } else {
            const next = new Set(servicePeriodIds);
            for (const id of ids) next.add(id);
            setPeriods(Array.from(next));
          }
        };
        const toggleVenue = (id: string) => {
          if (venueIds.includes(id)) setVenues(venueIds.filter((x) => x !== id));
          else setVenues([...venueIds, id]);
        };
        const toggleWeekday = (i: number) => {
          if (weekdays.includes(i)) setWeekdays(weekdays.filter((x) => x !== i));
          else setWeekdays([...weekdays, i]);
        };
        const toggleStatus = (s: OperatingStatus) => {
          if (operatingStatuses.includes(s)) setStatuses(operatingStatuses.filter((x) => x !== s));
          else setStatuses([...operatingStatuses, s]);
        };
        return (
          <div className="card-glass rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
            {/* Month nav */}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => { const d = new Date(year, month - 2, 1); setMonth(d.getFullYear(), d.getMonth() + 1); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium min-w-[120px] text-center tabular-nums">
                {monthName(month)} {year}
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => { const d = new Date(year, month, 1); setMonth(d.getFullYear(), d.getMonth() + 1); }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <ToolbarDivider />

            {/* Venue Scope */}
            <GroupLabel>Venue Scope</GroupLabel>
            <PillToggle active={venueIds.length === 0} onClick={() => setVenues([])} variant="outlined">
              All
            </PillToggle>
            {activeVenues.map((v) => (
              <PillToggle key={v.id}
                active={venueIds.includes(v.id)}
                onClick={() => toggleVenue(v.id)}
                variant="outlined">
                {v.name}
              </PillToggle>
            ))}

            <ToolbarDivider />

            {/* Day of Week */}
            <GroupLabel>Day of Week</GroupLabel>
            <PillToggle active={weekdays.length === 0} onClick={() => setWeekdays([])} variant="filled">
              All
            </PillToggle>
            {WEEKDAYS.map((w, i) => (
              <PillToggle key={w}
                active={weekdays.includes(i)}
                onClick={() => toggleWeekday(i)}
                variant="filled">
                {w}
              </PillToggle>
            ))}

            <ToolbarDivider />

            {/* Periods (text links) */}
            <LinkToggle active={servicePeriodIds.length === 0} onClick={() => setPeriods([])}>
              All Periods
            </LinkToggle>
            {distinctNames.map((name) => (
              <LinkToggle key={name} active={isNameSelected(name)} onClick={() => toggleName(name)}>
                {name}
              </LinkToggle>
            ))}

            <ToolbarDivider />

            {/* Status (text links) */}
            <LinkToggle active={operatingStatuses.length === 0} onClick={() => setStatuses([])}>
              All Status
            </LinkToggle>
            {STATUSES.map((s) => (
              <LinkToggle key={s} active={operatingStatuses.includes(s)} onClick={() => toggleStatus(s)}>
                {s.replace("_", " ")}
              </LinkToggle>
            ))}

            {/* Right-aligned action */}
            <div className="ml-auto flex items-center gap-1">
              {effectiveVenueIds.length > 0 && (
                managerLines.length === 0 ? (
                  <Button size="sm" variant="default" onClick={handleSetUpMonth} disabled={generatingStat}>
                    <Sparkles className="h-4 w-4 mr-1.5" /> Set Up This Month
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={handleRecomputeStat} disabled={generatingStat}
                    title="Refresh data">
                    <RefreshCw className={`h-4 w-4 ${generatingStat ? "animate-spin" : ""}`} />
                  </Button>
                )
              )}
            </div>
          </div>
        );
      })()}


      {/* KPI CARDS */}
      {(() => {
        const avm = monthly.managerRevenueToDate > 0
          ? (monthly.actualRevenue / monthly.managerRevenueToDate - 1) * 100
          : null;
        const avs = monthly.statRevenueToDate > 0
          ? (monthly.actualRevenue / monthly.statRevenueToDate - 1) * 100
          : null;
        const spgPct = monthly.statSpgToDate && monthly.actualSpgToDate != null
          ? (monthly.actualSpgToDate / monthly.statSpgToDate - 1) * 100
          : null;
        const remaining = monthly.managerRevenue - monthly.actualRevenue;

        const paceValue =
          remainingDays === 0 ? "HK$ 0"
          : remaining <= 0 ? "HK$ 0"
          : `${fmtHKD(remaining / remainingDays)}/day`;
        const paceHint =
          remainingDays === 0 ? "Month complete"
          : remaining <= 0 ? `Target already exceeded · ${remainingDays} days left`
          : `${fmtHKD(remaining)} remaining · ${remainingDays} days left`;

        const pctFmt = (v: number | null) =>
          v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
        const pctColor = (v: number | null) =>
          v == null ? undefined : v >= 0 ? C.pos : C.neg;

        const HeadlineCard = ({ label, value, hint, color }: {
          label: string; value: React.ReactNode; hint: React.ReactNode; color?: string;
        }) => (
          <Card className="p-4 border-border bg-card flex flex-col justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color }}>
              {value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </Card>
        );

        const SecondaryCard = ({ dot, label, value }: {
          dot: string; label: string; value: React.ReactNode;
        }) => (
          <Card className="p-2.5 border-border bg-card">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
            </div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground/90">{value}</div>
          </Card>
        );

        return (
          <div className="space-y-2.5">
            {/* Row 1: 4 equal-weight headline cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <HeadlineCard
                label="Actual vs Manager"
                value={pctFmt(avm)}
                color={pctColor(avm)}
                hint={`${fmtHKD(monthly.actualRevenue)} of ${fmtHKD(monthly.managerRevenueToDate)} planned to date`}
              />
              <HeadlineCard
                label="Actual vs Statistical"
                value={pctFmt(avs)}
                color={pctColor(avs)}
                hint={`Model accuracy — ${completedDays} days tracked`}
              />
              <HeadlineCard
                label="Required Daily Pace"
                value={paceValue}
                color="hsl(var(--primary))"
                hint={paceHint}
              />
              <HeadlineCard
                label="Actual SPG vs Statistical SPG"
                value={pctFmt(spgPct)}
                color={pctColor(spgPct)}
                hint={monthly.actualSpgToDate != null && monthly.statSpgToDate != null
                  ? `HK$ ${monthly.actualSpgToDate.toFixed(0)} vs HK$ ${monthly.statSpgToDate.toFixed(0)} model`
                  : "—"}
              />
            </div>

            {/* Row 2: secondary reference row */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
              <SecondaryCard dot={C.stat} label="Statistical Revenue" value={fmtHKD(monthly.statRevenue)} />
              <SecondaryCard dot={C.manager} label="Manager Revenue" value={fmtHKD(monthly.managerRevenue)} />
              <SecondaryCard dot={C.actual} label="Actual Revenue" value={fmtHKD(monthly.actualRevenue)} />
              <SecondaryCard dot={C.manager} label="Manager Guests" value={fmtInt(monthly.managerGuests)} />
              <SecondaryCard dot={C.actual} label="Actual Guests" value={fmtInt(monthly.actualGuests)} />
            </div>
          </div>
        );
      })()}

      {/* SECTION 4: Daily performance + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-3.5">
        <SectionCard title="Daily Revenue Performance" className="lg:col-span-7">
          {dailyChartData.length === 0 ? (
            <EmptyChart label="No revenue data for this period." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any) => fmtHKD(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="stat" name="Statistical" stroke={C.stat} strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.6} />
                <Line type="monotone" dataKey="mgr" name="Manager" stroke={C.manager} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="act" name="Actual" stroke={C.actual} strokeWidth={2.75} dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--chart-3))" }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Target Summary" className="lg:col-span-3">
          <div className="space-y-2 text-sm">
            <SummaryRow label="Venues" value={effectiveVenueIds.length === activeVenues.length ? "All active" : `${effectiveVenueIds.length} selected`} />
            <SummaryRow label="Service Periods" value={servicePeriodIds.length === 0 ? "All operational" : `${servicePeriodIds.length} selected`} />
            <div className="h-px bg-border my-2" />
            <SummaryRow label="Statistical Revenue" value={fmtHKD(monthly.statRevenue)} />
            <SummaryRow label="Manager Revenue" value={fmtHKD(monthly.managerRevenue)} strong />
            <SummaryRow label="Actual to date" value={fmtHKD(monthly.actualRevenue)} />
            <div className="h-px bg-border my-2" />
            <SummaryRow
              label="Manager vs Statistical"
              value={monthly.statRevenue > 0
                ? `${((monthly.managerRevenue / monthly.statRevenue - 1) * 100).toFixed(1)}%`
                : "—"}
            />
            <SummaryRow
              label="Actual vs Manager"
              value={monthly.managerRevenue > 0
                ? `${((monthly.actualRevenue / monthly.managerRevenue - 1) * 100).toFixed(1)}%`
                : "—"}
            />
            <div className="h-px bg-border my-2" />
            <SummaryRow label="Completed days" value={String(completedDays)} />
            <SummaryRow label="Remaining days" value={String(remainingDays)} />
          </div>
        </SectionCard>
      </div>

      {/* SECTION 5: Secondary charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <SectionCard title="Cumulative Revenue Pace">
          {cumulativeData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: any) => fmtHKD(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="stat" name="Statistical" stroke={C.stat} strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.6} />
                <Line type="monotone" dataKey="mgr" name="Manager" stroke={C.manager} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="act" name="Actual" stroke={C.actual} strokeWidth={2.75} dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--chart-3))" }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Daily Revenue Variance to Manager">
          {varianceData.length === 0 ? <EmptyChart label="No completed days yet." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={varianceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: any) => fmtHKD(Number(v))} />
                <ReferenceLine y={0} stroke={C.grid} />
                <Bar dataKey="delta" name="Actual − Manager" radius={[2, 2, 0, 0]}>
                  {varianceData.map((d, i) => (
                    <Cell key={i} fill={d.delta >= 0 ? C.pos : C.neg} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* SECTION 6: Guest + SPG (variance drivers moved into Detailed Analytics) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Guest Performance">
          {guestData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={guestData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="stat" name="Statistical" stroke={C.stat} strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.6} />
                <Line type="monotone" dataKey="mgr" name="Manager" stroke={C.manager} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="act" name="Actual" stroke={C.actual} strokeWidth={2.75} dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--chart-3))" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Spend per Guest">
          {spgData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={spgData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: any) => v == null ? "—" : fmtHKD(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="stat" name="Statistical" stroke={C.stat} strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.6} />
                <Line type="monotone" dataKey="mgr" name="Manager" stroke={C.manager} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="act" name="Actual" stroke={C.actual} strokeWidth={2.75} dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--chart-3))" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* SECTIONS 7 + 8: Detailed Analytics (collapsed by default) */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="detail" className="border border-border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
            Detailed Analytics
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <SectionCard title="Revenue Variance Drivers (MTD vs Manager Target, completed days only)">
                {monthly.actualRevenue === 0 && monthly.managerRevenue === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={varianceDrivers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={110} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                        formatter={(v: any) => fmtHKD(Number(v))} />
                      <ReferenceLine x={0} stroke={C.grid} />
                      <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                        {varianceDrivers.map((d, i) => (
                          <Cell key={i} fill={d.value >= 0 ? C.pos : C.neg} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>

              <SectionCard title="Day-of-Week Analysis">
                {weekdayRows.length === 0 ? <EmptyChart /> : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={weekdayRows.map((r) => ({ ...r, name: WEEKDAYS[r.weekday] }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                          formatter={(v: any) => fmtHKD(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="avgStat" name="Avg Statistical" fill={C.stat} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="avgMgr" name="Avg Manager" fill={C.manager} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="avgAct" name="Avg Actual" fill={C.actual} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border">
                            <th className="text-left py-2 px-2">Weekday</th>
                            <th className="text-right py-2 px-2">Occ.</th>
                            <th className="text-right py-2 px-2">Avg Stat Rev</th>
                            <th className="text-right py-2 px-2">Avg Mgr Rev</th>
                            <th className="text-right py-2 px-2">Avg Act Rev</th>
                            <th className="text-right py-2 px-2">Avg Mgr Guests</th>
                            <th className="text-right py-2 px-2">Avg Act Guests</th>
                            <th className="text-right py-2 px-2">Mgr SPG</th>
                            <th className="text-right py-2 px-2">Act SPG</th>
                            <th className="text-right py-2 px-2">Var vs Mgr</th>
                            <th className="text-right py-2 px-2">Achv.</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {weekdayRows.map((r) => (
                            <tr key={r.weekday} className="border-b border-border/50">
                              <td className="py-2 px-2 font-medium">{WEEKDAY_LONG[r.weekday]}</td>
                              <td className="text-right px-2">{r.occurrences}</td>
                              <td className="text-right px-2">{fmtHKD(r.avgStat)}</td>
                              <td className="text-right px-2">{fmtHKD(r.avgMgr)}</td>
                              <td className="text-right px-2">{fmtHKD(r.avgAct)}</td>
                              <td className="text-right px-2">{fmtInt(r.avgMgrG)}</td>
                              <td className="text-right px-2">{fmtInt(r.avgActG)}</td>
                              <td className="text-right px-2">{fmtHKD(r.mgrSpg)}</td>
                              <td className="text-right px-2">{fmtHKD(r.actSpg)}</td>
                              <td className={`text-right px-2 ${r.varVsMgr != null ? (r.varVsMgr >= 0 ? "text-emerald-500" : "text-rose-500") : ""}`}>
                                {fmtHKD(r.varVsMgr)}
                              </td>
                              <td className="text-right px-2">{fmtPct(r.achievement)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </SectionCard>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard title="Venue Target Performance">
                  {venueRows.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={venueRows}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                          formatter={(v: any) => fmtHKD(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="stat" name="Statistical" fill={C.stat} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="mgr" name="Manager" fill={C.manager} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="act" name="Actual" fill={C.actual} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </SectionCard>
                <SectionCard title="Service-Period Revenue Mix" right={
                  <span className="text-[11px] text-muted-foreground">Manager totals · Actuals unavailable per period</span>
                }>
                  {servicePeriodMix.length === 0 ? <EmptyChart label="No configured service periods." /> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={servicePeriodMix} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} opacity={0.4} />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                          formatter={(v: any) => fmtHKD(Number(v))} />
                        <Bar dataKey="mgr" name="Manager Revenue" fill={C.manager} radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </SectionCard>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>


      {/* SECTION 9: Target Intelligence */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label="Days On/Above Target"
          value={`${intel.onTarget} / ${intel.completed}`}
          hint={intel.completed > 0 ? `${((intel.onTarget / intel.completed) * 100).toFixed(0)}% hit rate` : "No completed days"} />
        <KpiCard label="Strongest Performance"
          value={intel.best ? fmtHKD(intel.best.delta) : "—"}
          hint={intel.best?.date ?? "—"} />
        <KpiCard label="Largest Shortfall"
          value={intel.worst ? fmtHKD(intel.worst.delta) : "—"}
          hint={intel.worst?.date ?? "—"} />
        <KpiCard label="Manager-Adjusted Targets"
          value={String(intel.adjusted)}
          hint={`of ${managerLines.length} lines`} />
      </div>

      {/* SECTION 10: Daily Target Register */}
      <DailyRegister
        year={year} month={month}
        venues={activeVenues.filter((v) => effectiveVenueIds.includes(v.id))}
        periods={allPeriods}
        opPeriods={opPeriods}
        days={days}
        lines={linesWithEdits}
        statistical={statistical}
        actuals={actuals}
        actualsByPeriod={actualsByPeriod}

        pendingIds={new Set(Object.keys(pendingEdits))}
        canEdit={canEdit}
        canApprove={perms.canApprove}
        onEdit={editLine}
        onSaveDay={saveDay}
        onApproveDay={approveDay}
        onApplyStatistical={applyStatistical}
        onSetStatus={setOperatingStatus}
        requestReason={requestReason}
        onLineStatus={async (line, lineStatus, reason) => {
          const commit = async (r: string | null) => {
            const res = await mutations.upsertManagerLine({
              id: line.id, venueId: line.venueId, targetDate: line.targetDate,
              lineType: line.lineType, servicePeriodId: line.servicePeriodId,
              targetInputMode: line.targetInputMode,
              managerGuestTarget: line.managerGuestTarget,
              managerSpendPerGuestTarget: line.managerSpendPerGuestTarget,
              lineStatus, zeroReason: r,
              status: line.status,
            });
            if (res.ok) await refetchLines();
          };
          // Reactivation and operating do not require a reason
          if (lineStatus === "operating") return commit(null);
          if (reason) return commit(reason);
          const kind: AdjustmentReasonKind =
            lineStatus === "replaced_by_event" ? "replaced_by_event" : "not_operating";
          requestReason(kind, async (r) => { setReasonReq(null); await commit(r); });
        }}
        onAddEvent={async (venueId, date, ev) => {
          // Atomic RPC: event creation + replacement in one DB call.
          const r = await mutations.addEventWithReplacement({
            venueId, targetDate: date,
            eventName: ev.name, eventMode: ev.mode,
            replacesServicePeriodId: ev.replacesServicePeriodId ?? null,
            targetInputMode: ev.contractedRevenue != null ? "contracted_revenue" : "drivers",
            managerGuestTarget: ev.guests ?? null,
            managerSpendPerGuestTarget: ev.spg ?? null,
            managerRevenueOverride: ev.contractedRevenue ?? null,
            notes: ev.reason ?? null,
          });
          if (r.ok) await refetchLines();
        }}
      />

      {reasonReq && (
        <AdjustmentReasonDialog
          open={!!reasonReq}
          kind={reasonReq.kind}
          onCancel={() => setReasonReq(null)}
          onConfirm={async (reason) => { await reasonReq.onConfirm(reason); }}
        />
      )}


      {/* SECTION 11: Rollup */}
      <SectionCard title={isFiltered ? "Filtered Roll-up" : `${monthName(month)} ${year} Roll-up`}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-sm">
          <RollupCell label="Statistical Revenue" value={fmtHKD(monthly.statRevenue)} />
          <RollupCell label="Manager Revenue" value={fmtHKD(monthly.managerRevenue)} />
          <RollupCell label="Actual Revenue" value={fmtHKD(monthly.actualRevenue)} />
          <RollupCell label="Manager Guests" value={fmtInt(monthly.managerGuests)} />
          <RollupCell label="Actual Guests" value={fmtInt(monthly.actualGuests)} />
          <RollupCell label="Manager SPG" value={fmtHKD(monthly.managerSpg)} />
          <RollupCell label="Actual SPG" value={fmtHKD(monthly.actualSpg)} />
          <RollupCell label="Actual vs Manager"
            value={monthly.managerRevenue > 0
              ? `${((monthly.actualRevenue / monthly.managerRevenue - 1) * 100).toFixed(1)}%`
              : "—"} />
        </div>
      </SectionCard>
    </div>
  );
}

// ---------- Small pieces ----------
function SummaryRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function RollupCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-lg font-bold tabular-nums text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function EmptyChart({ label = "No data available." }: { label?: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}

// ---------- DAILY REGISTER ----------

interface DailyRegisterProps {
  year: number; month: number;
  venues: { id: string; name: string }[];
  periods: VenueServicePeriod[];
  opPeriods: VenueServicePeriod[];
  days: any[];
  lines: ManagerTargetLine[];
  statistical: any[];
  actuals: any[];
  actualsByPeriod: Map<string, { revenue: number; guests: number; spendPerGuest: number | null }>;
  pendingIds: Set<string>;
  canEdit: boolean;
  canApprove: boolean;
  onEdit: (id: string, patch: Partial<ManagerTargetLine>) => void;
  onSaveDay: (venueId: string, date: string) => Promise<void>;
  onApproveDay: (venueId: string, date: string) => Promise<void>;
  onApplyStatistical: (line: ManagerTargetLine, stat: { rev: number | null; g: number | null; spg: number | null }) => Promise<void>;
  onSetStatus: (venueId: string, date: string, s: OperatingStatus, notes?: string) => Promise<void>;
  onLineStatus: (line: ManagerTargetLine, s: any, reason?: string) => Promise<void>;
  onAddEvent: (venueId: string, date: string, ev: {
    name: string; mode: EventMode; replacesServicePeriodId?: string | null;
    guests?: number | null; spg?: number | null; contractedRevenue?: number | null;
    reason?: string | null;
  }) => Promise<void>;
  requestReason: (kind: AdjustmentReasonKind, onConfirm: (reason: string) => void | Promise<void>) => void;
}

function DailyRegister(props: DailyRegisterProps) {
  const { year, month, venues, periods, opPeriods, days, lines, statistical, actuals, actualsByPeriod,
    pendingIds, canEdit, canApprove, onEdit, onSaveDay, onApproveDay, onApplyStatistical,
    onSetStatus, onLineStatus, requestReason } = props;
  void opPeriods;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => isoDate(year, month, i + 1));

  const key = (v: string, d: string) => `${v}__${d}`;
  const dayStatus = useMemo(() => {
    const m = new Map<string, OperatingStatus>();
    for (const d of days) m.set(key(d.venueId, d.targetDate), d.operatingStatus);
    return m;
  }, [days]);

  const linesByDay = useMemo(() => {
    const m = new Map<string, ManagerTargetLine[]>();
    for (const l of lines) {
      const k = key(l.venueId, l.targetDate);
      const arr = m.get(k) ?? [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [lines]);

  const statByDay = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of statistical) m.set(key(s.venueId, s.targetDate), s);
    return m;
  }, [statistical]);

  const actByDay = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of actuals) m.set(key(a.venueId, a.targetDate), a);
    return m;
  }, [actuals]);

  const rows: { venueId: string; venueName: string; date: string }[] = [];
  for (const v of venues) for (const d of dates) rows.push({ venueId: v.id, venueName: v.name, date: d });

  return (
    <SectionCard title="Daily Target Register" right={
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /> Pending changes</span>
      </div>
    }>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1100px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="w-6"></th>
              <th className="text-left py-2 px-2">Date</th>
              <th className="text-left py-2 px-2">Weekday</th>
              <th className="text-left py-2 px-2">Venue</th>
              <th className="text-right py-2 px-2">Stat Rev</th>
              <th className="text-right py-2 px-2">Mgr Rev</th>
              <th className="text-right py-2 px-2">Act Rev</th>
              <th className="text-right py-2 px-2">Mgr Guests</th>
              <th className="text-right py-2 px-2">Act Guests</th>
              <th className="text-right py-2 px-2">Mgr SPG</th>
              <th className="text-right py-2 px-2">Act SPG</th>
              <th className="text-right py-2 px-2">Act vs Mgr</th>
              <th className="text-right py-2 px-2">Act vs Stat</th>
              <th className="text-left py-2 px-2">Performance</th>
              
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => {
              const k = key(r.venueId, r.date);
              const lns = linesByDay.get(k) ?? [];
              const opLines = lns.filter((l) => isOperationalLine(l, periods));
              const spLines = opLines.filter((l) => l.lineType === "service_period");
              const agg = aggregateManager(lns, periods);
              const stat = statByDay.get(k);
              const act = actByDay.get(k);
              const wd = new Date(r.date + "T00:00:00Z").getUTCDay();
              const isOpen = expanded.has(k);
              const hasPending = lns.some((l) => pendingIds.has(l.id));
              const anyDraft = lns.some((l) => l.status === "draft" && l.lineStatus === "operating"
                && (l.managerGuestTarget == null || l.managerSpendPerGuestTarget == null));

              const venueOpPeriods = periods.filter(
                (p) => p.venueId === r.venueId && p.isActive && !p.isRollupOnly,
              );
              const isSinglePeriodVenue = venueOpPeriods.length === 1;

              const mgrRev = agg.revenue;
              const actRev = act?.revenue ?? null;
              const statRev = stat?.statisticalTargetAmount ?? null;
              const perfBadge = actRev == null
                ? <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">Future</Badge>
                : (actRev >= mgrRev
                  ? <Badge className="text-[10px] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.3)]">On / above</Badge>
                  : <Badge className="text-[10px] bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/0.3)]">Below</Badge>);

              const deltaMgr = actRev != null ? actRev - mgrRev : null;
              const deltaStat = actRev != null && statRev != null ? actRev - statRev : null;
              const deltaMgrClass = deltaMgr == null ? "" : (deltaMgr >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]");
              const deltaStatClass = deltaStat == null ? "" : (deltaStat >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]");

              return (
                <React.Fragment key={k}>
                  <tr className={`border-b border-border/50 hover:bg-muted/30 ${hasPending ? "bg-primary/5" : ""}`}>
                    <td className="py-1.5 px-1">
                      <button onClick={() => {
                        const n = new Set(expanded);
                        n.has(k) ? n.delete(k) : n.add(k);
                        setExpanded(n);
                      }}>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronR className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="py-1.5 px-2 text-foreground font-medium tabular-nums">{r.date.slice(8)}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{WEEKDAYS[wd]}</td>
                    <td className="py-1.5 px-2 font-medium">{r.venueName}</td>
                    <td className="text-right px-2 tabular-nums">
                      {stat ? (
                        <div className="flex flex-col items-end">
                          <span>{fmtHKD(statRev)}</span>
                          <span className="text-[10px] text-muted-foreground">Median of prior {WEEKDAYS[wd]}s</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="text-right px-2 font-semibold tabular-nums">
                      {anyDraft ? <span className="text-muted-foreground italic font-normal">Not set</span> : fmtHKD(mgrRev)}
                    </td>
                    <td className="text-right px-2 tabular-nums">{fmtHKD(actRev)}</td>
                    <td className="text-right px-2 tabular-nums">
                      {anyDraft ? <span className="text-muted-foreground italic">Not set</span> : fmtInt(agg.guests)}
                    </td>
                    <td className="text-right px-2 tabular-nums">{fmtInt(act?.guests ?? null)}</td>
                    <td className="text-right px-2 tabular-nums">
                      {anyDraft ? <span className="text-muted-foreground italic">Not set</span> : fmtHKD(agg.spendPerGuest)}
                    </td>
                    <td className="text-right px-2 tabular-nums">{act && act.guests > 0 ? fmtHKD(act.revenue / act.guests) : "—"}</td>
                    <td className={`text-right px-2 tabular-nums ${deltaMgrClass}`}>
                      {deltaMgr != null ? fmtHKD(deltaMgr) : "—"}
                    </td>
                    <td className={`text-right px-2 tabular-nums ${deltaStatClass}`}>
                      {deltaStat != null ? fmtHKD(deltaStat) : "—"}
                    </td>
                    <td className="py-1.5 px-2">{perfBadge}</td>
                  </tr>
                  {isOpen && spLines.length === 0 && (
                    <tr className="border-b border-border/50">
                      <td className="w-6"></td>
                      <td colSpan={13} className="py-1.5 px-2 border-l-2 border-primary/30 pl-6 text-muted-foreground text-xs">
                        No service-period rows for this day.
                      </td>
                    </tr>
                  )}
                  {isOpen && spLines.map((l) => {
                    const p = periods.find((pp) => pp.id === l.servicePeriodId);
                    const periodLabel = p?.name
                      ?? <span className="italic text-muted-foreground">Untagged</span>;
                    const periodActual = l.servicePeriodId
                      ? actualsByPeriod.get(`${l.venueId}__${l.targetDate}__${l.servicePeriodId}`) ?? null
                      : null;
                    const canUseStat = isSinglePeriodVenue
                      && stat?.statisticalGuestTarget != null
                      && stat?.statisticalSpendPerGuest != null;
                    const notOperating = l.lineStatus !== "operating";
                    const effGuest = l.managerGuestTarget ?? (isSinglePeriodVenue ? stat?.statisticalGuestTarget ?? null : null);
                    const effSpg = l.managerSpendPerGuestTarget ?? (isSinglePeriodVenue ? stat?.statisticalSpendPerGuest ?? null : null);
                    const guestIsPrefill = l.managerGuestTarget == null && isSinglePeriodVenue && stat?.statisticalGuestTarget != null;
                    const spgIsPrefill = l.managerSpendPerGuestTarget == null && isSinglePeriodVenue && stat?.statisticalSpendPerGuest != null;
                    const lineRev = managerRevenue(l);
                    void canUseStat;
                    const inputCls = "h-7 w-24 text-right text-xs border-border/60 focus-visible:ring-1 focus-visible:ring-primary/40 bg-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
                    return (
                      <tr key={l.id} className={`border-b border-border/40 bg-muted/10 ${notOperating ? "opacity-60" : ""}`}>
                        <td className="w-6"></td>
                        <td colSpan={4} className="py-1.5 pl-6 pr-2 border-l-2 border-primary/30 text-muted-foreground text-[11px]">
                          <span className="mr-1">└─</span>
                          <span className="text-foreground font-medium">{periodLabel}</span>
                        </td>
                        <td className="text-right px-2 tabular-nums">
                          {isSinglePeriodVenue && stat ? fmtHKD(stat.statisticalTargetAmount) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right px-2 font-semibold tabular-nums">
                          {lineRev == null ? <span className="text-muted-foreground italic font-normal">Not set</span> : fmtHKD(lineRev)}
                        </td>
                        <td className="text-right px-2 tabular-nums">
                          {periodActual ? fmtHKD(periodActual.revenue) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right px-2 tabular-nums">
                          {canEdit && !notOperating ? (
                            <Input type="number"
                              className={`${inputCls} ml-auto ${guestIsPrefill ? "text-muted-foreground" : "text-foreground"}`}
                              value={effGuest ?? ""} placeholder="—"
                              onChange={(e) => onEdit(l.id, { managerGuestTarget: e.target.value === "" ? null : Number(e.target.value) })} />
                          ) : (effGuest == null
                              ? <span className="text-muted-foreground italic">Not set</span>
                              : <span className={guestIsPrefill ? "text-muted-foreground" : undefined}>{fmtInt(effGuest)}</span>)}
                        </td>
                        <td className="text-right px-2 tabular-nums">
                          {periodActual ? fmtInt(periodActual.guests) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right px-2 tabular-nums">
                          {canEdit && !notOperating ? (
                            <Input type="number" step="0.01"
                              className={`${inputCls} ml-auto ${spgIsPrefill ? "text-muted-foreground" : "text-foreground"}`}
                              value={effSpg ?? ""} placeholder="—"
                              onChange={(e) => onEdit(l.id, { managerSpendPerGuestTarget: e.target.value === "" ? null : Number(e.target.value) })} />
                          ) : (effSpg == null
                              ? <span className="text-muted-foreground italic">Not set</span>
                              : <span className={spgIsPrefill ? "text-muted-foreground" : undefined}>{fmtHKD(effSpg)}</span>)}
                        </td>
                        <td className="text-right px-2 tabular-nums">
                          {periodActual && periodActual.spendPerGuest != null
                            ? fmtHKD(periodActual.spendPerGuest)
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right px-2 text-muted-foreground">—</td>
                        <td className="text-right px-2 text-muted-foreground">—</td>
                        <td className="py-1.5 px-2 text-muted-foreground">—</td>
                      </tr>
                    );
                  })}

                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}




function EventTable({ lines, canEdit, onEdit, onLineStatus }: {
  lines: ManagerTargetLine[]; canEdit: boolean;
  onEdit: (id: string, patch: Partial<ManagerTargetLine>) => void;
  onLineStatus: (line: ManagerTargetLine, s: any, reason?: string) => Promise<void>;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground border-b border-border/70">
          <th className="text-left py-1.5 px-2">Event</th>
          <th className="text-left py-1.5 px-2">Mode</th>
          <th className="text-right py-1.5 px-2">Mgr Guests</th>
          <th className="text-right py-1.5 px-2">Mgr SPG</th>
          <th className="text-right py-1.5 px-2">Contracted</th>
          <th className="text-right py-1.5 px-2">Mgr Rev</th>
          <th className="text-left py-1.5 px-2">Actual</th>
          <th className="text-left py-1.5 px-2">Actions</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-border/40">
            <td className="py-1.5 px-2 font-medium">{l.eventName}</td>
            <td className="py-1.5 px-2">
              <Badge variant="outline" className="text-[10px]">{l.eventMode?.replace(/_/g, " ")}</Badge>
            </td>
            <td className="text-right px-2">
              {canEdit ? (
                <Input type="number" className="h-7 w-20 text-right text-xs ml-auto"
                  value={l.managerGuestTarget ?? ""}
                  onChange={(e) => onEdit(l.id, { managerGuestTarget: e.target.value === "" ? null : Number(e.target.value) })} />
              ) : fmtInt(l.managerGuestTarget)}
            </td>
            <td className="text-right px-2">
              {canEdit ? (
                <Input type="number" step="0.01" className="h-7 w-20 text-right text-xs ml-auto"
                  value={l.managerSpendPerGuestTarget ?? ""}
                  onChange={(e) => onEdit(l.id, { managerSpendPerGuestTarget: e.target.value === "" ? null : Number(e.target.value) })} />
              ) : fmtHKD(l.managerSpendPerGuestTarget)}
            </td>
            <td className="text-right px-2">{fmtHKD(l.managerRevenueOverride)}</td>
            <td className="text-right px-2 font-semibold">{fmtHKD(managerRevenue(l))}</td>
            <td className="text-muted-foreground py-1.5 px-2">Unavailable</td>
            <td className="py-1.5 px-2">
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-rose-500"
                  onClick={() => onLineStatus(l, "closed", "Event removed")}>Remove</Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventDialog({ open, onClose, periods, onSubmit }: {
  open: boolean; onClose: () => void; periods: VenueServicePeriod[];
  onSubmit: (ev: {
    name: string; mode: EventMode; replacesServicePeriodId?: string | null;
    guests?: number | null; spg?: number | null; contractedRevenue?: number | null;
    reason?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<EventMode>("additive");
  const [replacesId, setReplacesId] = useState<string | undefined>();
  const [guests, setGuests] = useState<string>("");
  const [spg, setSpg] = useState<string>("");
  const [contracted, setContracted] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const reasonRequired = mode === "replaces_period" || mode === "events_only";
  const submit = async () => {
    if (!name.trim()) { toast({ title: "Event name required", variant: "destructive" }); return; }
    if (mode === "replaces_period" && !replacesId) {
      toast({ title: "Select the service period being replaced", variant: "destructive" }); return;
    }
    if (reasonRequired && reason.trim().length < 3) {
      toast({ title: "Reason required", description: "Explain why this event replaces normal service.", variant: "destructive" });
      return;
    }
    await onSubmit({
      name: name.trim(), mode,
      replacesServicePeriodId: mode === "replaces_period" ? replacesId : null,
      guests: guests ? Number(guests) : null,
      spg: spg ? Number(spg) : null,
      contractedRevenue: contracted ? Number(contracted) : null,
      reason: reasonRequired ? reason.trim() : null,
    });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Event name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Private buyout, promo night…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as EventMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="additive">Additive</SelectItem>
                  <SelectItem value="replaces_period">Replaces Period</SelectItem>
                  <SelectItem value="events_only">Events Only</SelectItem>
                  <SelectItem value="partial_replacement">Partial Replacement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(mode === "replaces_period") && (
              <div>
                <Label className="text-xs">Replaces</Label>
                <Select value={replacesId} onValueChange={setReplacesId}>
                  <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Guests</Label>
              <Input type="number" value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Spend / Guest</Label>
              <Input type="number" step="0.01" value={spg} onChange={(e) => setSpg(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Contracted Revenue</Label>
              <Input type="number" step="0.01" value={contracted} onChange={(e) => setContracted(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Use either drivers (Guests × Spend/Guest) or a Contracted Revenue amount.
          </p>
          {reasonRequired && (
            <div>
              <Label className="text-xs">
                Reason {mode === "replaces_period" ? "(replacement)" : "(events-only day)"}
              </Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why is normal service suspended?" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Add Event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ServicePeriodSetupSheet removed — now owned by /revenue/service-periods.

