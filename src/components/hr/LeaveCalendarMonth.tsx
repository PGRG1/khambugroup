import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HRLeaveRequest, HRLeaveType, HREmployee } from "@/hooks/useHRData";

interface Props {
  leaveRequests: HRLeaveRequest[];
  leaveTypes: HRLeaveType[];
  employees: HREmployee[];
}

const VENUE_TONE = [
  "bg-primary/15 text-primary border-primary/30",
  "bg-warning/15 text-warning border-warning/30",
  "bg-chart-2/15 text-chart-2 border-chart-2/30",
  "bg-chart-4/15 text-chart-4 border-chart-4/30",
  "bg-chart-5/15 text-chart-5 border-chart-5/30",
];

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDay(d: Date) {
  return d.toISOString().split("T")[0];
}

/** Month-view leave calendar spanning all venues; approved leave only. */
export function LeaveCalendarMonth({ leaveRequests, leaveTypes, employees }: Props) {
  const [base, setBase] = useState(startOfMonth(new Date()));

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

  const venues = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => e.venue && set.add(e.venue));
    return Array.from(set).sort();
  }, [employees]);

  const venueColor = (venue?: string | null) => {
    if (!venue) return "bg-muted text-muted-foreground border-border";
    const idx = venues.indexOf(venue);
    return VENUE_TONE[idx % VENUE_TONE.length];
  };

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const y = base.getFullYear();
    const m = base.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d++) days.push(new Date(y, m, d));
    return days;
  }, [base]);

  // Map ISO date -> approved leave requests active on that day
  const dayLeaves = useMemo(() => {
    const map: Record<string, HRLeaveRequest[]> = {};
    monthDays.forEach((d) => (map[isoDay(d)] = []));
    leaveRequests
      .filter((r) => r.status === "approved")
      .forEach((r) => {
        monthDays.forEach((d) => {
          const iso = isoDay(d);
          if (r.start_date <= iso && r.end_date >= iso) map[iso].push(r);
        });
      });
    return map;
  }, [leaveRequests, monthDays]);

  const monthLabel = base.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const todayIso = isoDay(new Date());

  const shiftMonth = (delta: number) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + delta);
    setBase(startOfMonth(d));
  };

  // Layout: 7-column grid starting from Monday
  const firstDay = new Date(base.getFullYear(), base.getMonth(), 1).getDay();
  const leadingBlanks = (firstDay + 6) % 7; // Monday-start

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold min-w-[140px] text-center">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setBase(startOfMonth(new Date()))}
          >
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {venues.slice(0, 5).map((v, i) => (
            <span key={v} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border ${VENUE_TONE[i % VENUE_TONE.length]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {v}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`b-${i}`} className="h-24 rounded-md bg-muted/20" />
        ))}
        {monthDays.map((d) => {
          const iso = isoDay(d);
          const items = dayLeaves[iso] || [];
          const isToday = iso === todayIso;
          const isWeekend = [0, 6].includes(d.getDay());
          return (
            <div
              key={iso}
              className={`h-24 rounded-md border p-1 overflow-hidden ${
                isToday
                  ? "border-primary bg-primary/5"
                  : isWeekend
                  ? "border-border/60 bg-muted/20"
                  : "border-border/60"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-semibold ${isToday ? "text-primary" : ""}`}>
                  {d.getDate()}
                </span>
                {items.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    {items.length}
                  </Badge>
                )}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((r) => {
                  const emp = empMap[r.employee_id];
                  if (!emp) return null;
                  const lt = ltMap[r.leave_type_id];
                  return (
                    <div
                      key={r.id}
                      title={`${emp.first_name} ${emp.last_name} · ${emp.venue ?? "—"} · ${lt?.name ?? "Leave"}`}
                      className={`text-[9px] truncate rounded px-1 py-[1px] border ${venueColor(emp.venue)}`}
                    >
                      {emp.first_name} {emp.last_name.slice(0, 1)}. · {lt?.name?.slice(0, 3).toUpperCase()}
                    </div>
                  );
                })}
                {items.length > 3 && (
                  <div className="text-[9px] text-muted-foreground">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
