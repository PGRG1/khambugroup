import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Clock, UserCheck, AlertTriangle, UserX, TreePalm } from "lucide-react";
import type { HRShift, HREmployee, HRLeaveRequest, HRLeaveType } from "@/hooks/useHRData";

interface Props {
  shifts: HRShift[];
  employees: HREmployee[];
  leaveRequests: HRLeaveRequest[];
  leaveTypes: HRLeaveType[];
}

function toMinutes(t?: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fmtTime(t?: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const TODAY_STR = () => new Date().toISOString().split("T")[0];

/**
 * Today Board — at-a-glance operations view for /hr/schedule default landing.
 * Groups the current day's shifts into On-shift / Late / No-show / On-leave
 * columns across every venue. Employee names link to profiles.
 */
export function TodayBoardView({ shifts, employees, leaveRequests, leaveTypes }: Props) {
  const today = TODAY_STR();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const empMap = useMemo(() => {
    const m: Record<string, HREmployee> = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const ltMap = useMemo(() => {
    const m: Record<string, HRLeaveType> = {};
    leaveTypes.forEach((t) => (m[t.id] = t));
    return m;
  }, [leaveTypes]);

  const todaysShifts = useMemo(
    () => shifts.filter((s) => s.shift_date === today),
    [shifts, today],
  );

  const onLeave = useMemo(() => {
    return leaveRequests.filter(
      (r) =>
        r.status === "approved" &&
        r.start_date <= today &&
        r.end_date >= today,
    );
  }, [leaveRequests, today]);

  // Classification
  const onShift: HRShift[] = [];
  const late: HRShift[] = [];
  const noShow: HRShift[] = [];
  const onLeaveShifts: HRShift[] = [];

  todaysShifts.forEach((s) => {
    const type = s.shift_type || "regular";
    if (["al", "sh", "no_pay", "sick_no_pay", "off"].includes(type)) {
      onLeaveShifts.push(s);
      return;
    }
    if (s.status === "no_show" || s.no_show) {
      noShow.push(s);
      return;
    }
    if (s.status === "completed") {
      onShift.push(s);
      return;
    }
    // scheduled
    const startMin = toMinutes(s.start_time);
    const endMin = toMinutes(s.end_time);
    if (startMin != null && endMin != null) {
      // handle overnight
      const isCurrent =
        endMin > startMin
          ? nowMin >= startMin && nowMin <= endMin
          : nowMin >= startMin || nowMin <= endMin;
      const isLate = startMin < nowMin && !s.actual_start_time && !isCurrent;
      if (isLate) late.push(s);
      else if (isCurrent) onShift.push(s);
      else onShift.push(s); // upcoming today — still on today's board
    } else {
      onShift.push(s);
    }
  });

  // Merge approved leave with shift-based leave to avoid duplicates
  const leaveByEmp = new Set(onLeaveShifts.map((s) => s.employee_id));
  const extraLeave = onLeave.filter((r) => !leaveByEmp.has(r.employee_id));

  const columns = [
    {
      key: "on_shift",
      label: "On Shift",
      icon: UserCheck,
      tone: "text-primary",
      count: onShift.length,
      render: () => onShift.map((s) => <ShiftRow key={s.id} shift={s} emp={empMap[s.employee_id]} />),
    },
    {
      key: "late",
      label: "Late",
      icon: Clock,
      tone: "text-warning",
      count: late.length,
      render: () => late.map((s) => <ShiftRow key={s.id} shift={s} emp={empMap[s.employee_id]} highlight="warning" />),
    },
    {
      key: "no_show",
      label: "No-show",
      icon: UserX,
      tone: "text-destructive",
      count: noShow.length,
      render: () => noShow.map((s) => <ShiftRow key={s.id} shift={s} emp={empMap[s.employee_id]} highlight="destructive" />),
    },
    {
      key: "leave",
      label: "On Leave",
      icon: TreePalm,
      tone: "text-muted-foreground",
      count: onLeaveShifts.length + extraLeave.length,
      render: () => (
        <>
          {onLeaveShifts.map((s) => (
            <LeaveRow
              key={s.id}
              emp={empMap[s.employee_id]}
              typeLabel={(s.shift_type || "").toUpperCase()}
            />
          ))}
          {extraLeave.map((r) => (
            <LeaveRow
              key={r.id}
              emp={empMap[r.employee_id]}
              typeLabel={ltMap[r.leave_type_id]?.name ?? "Leave"}
            />
          ))}
        </>
      ),
    },
  ];

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Today</p>
          <p className="text-sm font-semibold">{todayLabel}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {todaysShifts.length + extraLeave.length} people scheduled or on leave
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {columns.map((c) => (
          <Card key={c.key} className="p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <c.icon className={`h-4 w-4 ${c.tone}`} />
                <span className="text-sm font-semibold">{c.label}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {c.count}
              </Badge>
            </div>
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {c.count === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">—</p>
              ) : (
                c.render()
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ShiftRow({
  shift,
  emp,
  highlight,
}: {
  shift: HRShift;
  emp?: HREmployee;
  highlight?: "warning" | "destructive";
}) {
  if (!emp) return null;
  const cls =
    highlight === "warning"
      ? "border-warning/40 bg-warning/5"
      : highlight === "destructive"
      ? "border-destructive/40 bg-destructive/5"
      : "border-border/60";
  return (
    <Link
      to={`/hr/employees/${emp.id}`}
      className={`block rounded-md border px-2.5 py-1.5 hover:border-primary/40 transition-colors ${cls}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">
            {emp.first_name} {emp.last_name}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {emp.venue || "—"} · {emp.job_title || "—"}
          </div>
        </div>
        <div className="text-[10px] font-medium tabular-nums text-right whitespace-nowrap">
          {fmtTime(shift.start_time)}
          <br />
          <span className="text-muted-foreground">{fmtTime(shift.end_time)}</span>
        </div>
      </div>
    </Link>
  );
}

function LeaveRow({ emp, typeLabel }: { emp?: HREmployee; typeLabel: string }) {
  if (!emp) return null;
  return (
    <Link
      to={`/hr/employees/${emp.id}`}
      className="block rounded-md border border-border/60 px-2.5 py-1.5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">
            {emp.first_name} {emp.last_name}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{emp.venue || "—"}</div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {typeLabel}
        </Badge>
      </div>
    </Link>
  );
}
