import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useHRData } from "@/hooks/useHRData";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  TableSkeleton,
  EmptyState,
  fmtHKWhole,
  fmtDate,
} from "@/components/expenses/shared";
import { Users, CalendarCheck2, ClipboardCheck, AlertTriangle, ArrowRight } from "lucide-react";

function laborPctAvailable(pct: number | null, labor: number) {
  return pct != null && Number(labor || 0) > 0;
}

function ymOfDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
}

function startOfWeek(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0 Sun
  const diff = (day === 0 ? -6 : 1) - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export default function HRDashboard() {
  const { tenantId } = useActiveTenant();
  const { employees, shifts, leaveRequests, payroll, loading } = useHRData();
  const [laborRows, setLaborRows] = useState<any[]>([]);
  const [laborLoading, setLaborLoading] = useState(true);

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const { year, month } = ymOfDate(today);
  const weekStart = useMemo(() => startOfWeek(today), []);
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart); e.setDate(e.getDate() + 6); return e;
  }, [weekStart]);

  // Labor cost from the new view
  useEffect(() => {
    if (!tenantId) { setLaborLoading(false); return; }
    (async () => {
      setLaborLoading(true);
      const rows = await fetchAllRows(
        "v_labor_cost_by_venue_month",
        "*",
        { col: "venue", asc: true },
        tenantId,
      );
      setLaborRows((rows as any[]).filter((r) => r.year === year && r.month === month));
      setLaborLoading(false);
    })();
  }, [tenantId, year, month]);

  // Derived KPIs
  const activeEmployees = employees.filter((e) => (e.status ?? "active").toLowerCase() === "active");
  const byVenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of activeEmployees) {
      const k = e.venue || "Unassigned";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeEmployees]);

  const onShiftToday = useMemo(
    () => shifts.filter((s) => s.shift_date === iso && s.status !== "cancelled"),
    [shifts, iso],
  );

  const weekShifts = useMemo(
    () => shifts.filter((s) => {
      const d = new Date(s.shift_date);
      return d >= weekStart && d <= weekEnd;
    }),
    [shifts, weekStart, weekEnd],
  );

  const plannedHours = useMemo(() => weekShifts.reduce((s, sh) => {
    const [sh1, sm1] = (sh.start_time || "00:00").split(":").map(Number);
    const [sh2, sm2] = (sh.end_time || "00:00").split(":").map(Number);
    let mins = (sh2 * 60 + sm2) - (sh1 * 60 + sm1) - (sh.break_minutes || 0);
    if (mins < 0) mins += 24 * 60;
    return s + mins / 60;
  }, 0), [weekShifts]);
  const actualHours = useMemo(() => weekShifts.reduce((s, sh) => s + (sh.actual_hours_worked ?? 0), 0), [weekShifts]);
  const noShows = useMemo(() => weekShifts.filter((s) => s.no_show).length, [weekShifts]);

  const pending = useMemo(
    () => leaveRequests.filter((r) => (r.status ?? "").toLowerCase() === "pending"),
    [leaveRequests],
  );
  const onLeaveToday = useMemo(
    () => leaveRequests.filter((r) =>
      (r.status ?? "").toLowerCase() === "approved" &&
      r.start_date <= iso && r.end_date >= iso
    ),
    [leaveRequests, iso],
  );

  const mtdPayroll = useMemo(
    () => payroll.filter((p) => p.year === year && p.month === month),
    [payroll, year, month],
  );
  const mtdGross = mtdPayroll.reduce((s, p) => s + Number(p.gross_salary ?? p.actual_total ?? p.forecast_total ?? 0), 0);
  const mtdMpf = mtdPayroll.reduce((s, p) => s + Number(p.mpf_employer ?? 0), 0);
  const mtdLaborCost = mtdGross + mtdMpf;

  // Upcoming: probation ends, anniversaries within 30 days
  const upcoming = useMemo(() => {
    const items: { kind: string; date: string; label: string; empId: string }[] = [];
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    for (const e of activeEmployees) {
      if (e.hire_date) {
        const hd = new Date(e.hire_date);
        const anniv = new Date(today.getFullYear(), hd.getMonth(), hd.getDate());
        if (anniv < today) anniv.setFullYear(anniv.getFullYear() + 1);
        if (anniv <= in30) {
          const yrs = anniv.getFullYear() - hd.getFullYear();
          items.push({
            kind: "anniversary",
            date: anniv.toISOString().slice(0, 10),
            label: `${e.first_name} ${e.last_name} — ${yrs}yr anniversary`,
            empId: e.id,
          });
        }
      }
      if (e.end_date) {
        const ed = new Date(e.end_date);
        if (ed >= today && ed <= in30) {
          items.push({
            kind: "contract",
            date: e.end_date,
            label: `${e.first_name} ${e.last_name} — contract ends`,
            empId: e.id,
          });
        }
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [activeEmployees, today]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="People Dashboard"
        description={`Today, ${fmtDate(iso)} — headcount, labor cost, approvals, and this week's schedule at a glance.`}
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/hr/schedule">Schedule</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/hr/leave">Leave</Link></Button>
            <Button asChild size="sm"><Link to="/hr/payroll">Payroll</Link></Button>
          </div>
        }
      />

      {loading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Active headcount" value={activeEmployees.length.toLocaleString()} hint={`${byVenue.length} venues`} tone="info" />
            <KpiCard label="On shift today" value={onShiftToday.length.toLocaleString()} hint={`${onLeaveToday.length} on leave`} tone="success" />
            <KpiCard label="Pending leave approvals" value={pending.length.toLocaleString()} hint={pending.length ? "1-click approve" : "All caught up"} tone={pending.length ? "warning" : "default"} onClick={() => (window.location.href = "/hr/leave")} />
            <KpiCard label="Week hours (planned / actual)" value={`${plannedHours.toFixed(0)} / ${actualHours.toFixed(0)}`} hint={`${noShows} no-shows`} tone={actualHours < plannedHours * 0.9 ? "warning" : "default"} />
            <KpiCard label="MTD labor cost" value={fmtHKWhole(mtdLaborCost)} hint={`Gross ${fmtHKWhole(mtdGross)} · MPF ${fmtHKWhole(mtdMpf)}`} tone="info" />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Headcount by venue */}
            <Card className="card-glass p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-primary" />
                <div className="font-display font-semibold">Headcount by venue</div>
              </div>
              {byVenue.length === 0 ? (
                <EmptyState title="No employees yet" description="Add employees in the directory." />
              ) : (
                <div className="divide-y divide-border/40">
                  {byVenue.map(([venue, n]) => (
                    <Link
                      key={venue}
                      to={`/hr/employees?venue=${encodeURIComponent(venue)}`}
                      className="flex items-center justify-between py-2 text-sm hover:bg-accent/10 rounded px-1"
                    >
                      <span>{venue}</span>
                      <span className="tabular-nums font-medium">{n}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            {/* Labor cost % by venue */}
            <Card className="card-glass p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <div className="font-display font-semibold">
                  Labor cost % of revenue · {new Date(year, month - 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                </div>
              </div>
              {laborLoading ? (
                <TableSkeleton rows={4} cols={3} />
              ) : laborRows.length === 0 ? (
                <EmptyState title="No data for this month" description="Post payroll accruals and sync sales to see this KPI." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium py-1">Venue</th>
                      <th className="text-right font-medium py-1">Revenue</th>
                      <th className="text-right font-medium py-1">Labor</th>
                      <th className="text-right font-medium py-1">Labor %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {laborRows.map((r) => (
                      <tr key={r.venue}>
                        <td className="py-1.5">{r.venue}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtHKWhole(Number(r.revenue))}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtHKWhole(Number(r.labor_cost))}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium">
                          {r.labor_cost_pct == null ? "—" : `${Number(r.labor_cost_pct).toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Pending approvals */}
            <Card className="card-glass p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck2 className="h-4 w-4 text-warning" />
                  <div className="font-display font-semibold">Pending leave approvals</div>
                </div>
                <Badge variant="outline" className="text-[10px]">{pending.length}</Badge>
              </div>
              {pending.length === 0 ? (
                <EmptyState title="No pending requests" description="All leave requests are handled." />
              ) : (
                <div className="divide-y divide-border/40 max-h-64 overflow-auto">
                  {pending.slice(0, 8).map((r) => {
                    const emp = (r as any).employee;
                    return (
                      <Link
                        key={r.id}
                        to={`/hr/leave`}
                        className="flex items-center justify-between py-2 text-sm hover:bg-accent/10 rounded px-1"
                      >
                        <div>
                          <div className="font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {(r as any).leave_type?.name || "leave"} · {r.start_date} → {r.end_date} · {r.days}d
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Upcoming events */}
            <Card className="card-glass p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <div className="font-display font-semibold">Upcoming (next 30 days)</div>
              </div>
              {upcoming.length === 0 ? (
                <EmptyState title="Nothing scheduled" description="No anniversaries or contract end dates in the next 30 days." />
              ) : (
                <div className="divide-y divide-border/40">
                  {upcoming.map((u, i) => (
                    <Link
                      key={i}
                      to={`/hr/employees/${u.empId}`}
                      className="flex items-center justify-between py-2 text-sm hover:bg-accent/10 rounded px-1"
                    >
                      <div>
                        <div className="font-medium">{u.label}</div>
                        <div className="text-xs text-muted-foreground capitalize">{u.kind}</div>
                      </div>
                      <div className="tabular-nums text-xs text-muted-foreground">{fmtDate(u.date)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
