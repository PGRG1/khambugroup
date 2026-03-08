import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { HRShift, HREmployee, HRHoliday } from "@/hooks/useHRData";

interface Props {
  shifts: HRShift[];
  employees: HREmployee[];
  holidays: HRHoliday[];
  weekDates: Date[];
  onEditShift: (shift: HRShift) => void;
  onAddShift?: (employeeId: string, date: string) => void;
}

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const TYPE_TO_CODE: Record<string, string> = {
  al: "AL", sh: "SH", ph: "PH", sick_no_pay: "SL", no_pay: "NPL", off: "OFF", rest: "OFF",
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function calcHours(start: string, end: string): number {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function formatShiftTime(start: string, end: string): string {
  return `${formatTime12(start)} - ${formatTime12(end)}`;
}

function VarianceBadge({ plannedStart, plannedEnd, actualStart, actualEnd, noShow }: {
  plannedStart: string; plannedEnd: string;
  actualStart: string | null; actualEnd: string | null;
  noShow: boolean;
}) {
  if (noShow) {
    return <Badge variant="destructive" className="text-[9px] px-1.5 py-0">No Show</Badge>;
  }
  if (!actualStart || !actualEnd) {
    return <span className="text-[9px] text-muted-foreground italic">Pending</span>;
  }
  const planned = calcHours(plannedStart, plannedEnd);
  const actual = calcHours(actualStart, actualEnd);
  const diffMins = Math.round((actual - planned) * 60);
  if (diffMins === 0) {
    return <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/40 text-primary">On Time</Badge>;
  }
  const label = diffMins > 0 ? `+${diffMins}m` : `${diffMins}m`;
  const color = diffMins > 0
    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700"
    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700";
  return <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${color}`}>{label}</Badge>;
}

function getLeaveStyle(type: string): string {
  switch (type) {
    case "al": return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
    case "sh": case "ph": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
    case "sick_no_pay": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    case "no_pay": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400";
    case "off": case "rest": return "bg-muted text-muted-foreground";
    default: return "";
  }
}

export function ActualsComparisonView({ shifts, employees, holidays, weekDates, onEditShift, onAddShift }: Props) {
  const activeEmployees = useMemo(
    () => employees.filter(e => (e.status || "").trim().toLowerCase() === "active")
      .sort((a, b) => {
        const oA = a.sort_order ?? 999; const oB = b.sort_order ?? 999;
        if (oA !== oB) return oA - oB;
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      }),
    [employees]
  );

  const shiftMap = useMemo(() => {
    const map: Record<string, HRShift[]> = {};
    shifts.forEach(s => {
      const key = `${s.employee_id}_${s.shift_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [shifts]);

  const holidayDates = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);
  const todayStr = formatDate(new Date());

  // Summary totals per day
  const dailySummary = useMemo(() => {
    return weekDates.map(d => {
      const dateStr = formatDate(d);
      let plannedHrs = 0;
      let actualHrs = 0;
      let noShows = 0;
      let pending = 0;
      activeEmployees.forEach(emp => {
        const cellShifts = shiftMap[`${emp.id}_${dateStr}`] || [];
        cellShifts.forEach(s => {
          if (s.shift_type === "regular" || !s.shift_type) {
            plannedHrs += calcHours(s.start_time, s.end_time);
            if (s.no_show) noShows++;
            else if (s.actual_start_time && s.actual_end_time) {
              actualHrs += calcHours(s.actual_start_time, s.actual_end_time);
            } else {
              pending++;
            }
          }
        });
      });
      return { plannedHrs, actualHrs, noShows, pending, variance: actualHrs - plannedHrs };
    });
  }, [weekDates, activeEmployees, shiftMap]);

  const thClass = "px-2 py-1.5 text-[11px] font-semibold text-center whitespace-nowrap";
  const tdClass = "px-1.5 py-1 text-[10px] whitespace-nowrap border-r border-border/40 last:border-r-0";

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                <th className={`${thClass} text-left min-w-[140px] sticky left-0 bg-muted/60 z-10`}>Employee</th>
                {weekDates.map((d, i) => {
                  const dateStr = formatDate(d);
                  const isToday = dateStr === todayStr;
                  const isHoliday = holidayDates.has(dateStr);
                  return (
                    <th key={i} className={`${thClass} min-w-[120px] ${isToday ? "bg-primary/10" : ""} ${isHoliday ? "bg-green-50 dark:bg-green-900/10" : ""}`}>
                      <div>{DAY_NAMES[i]}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map(emp => (
                <tr key={emp.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className={`${tdClass} sticky left-0 bg-background z-10 font-medium text-[11px]`}>
                    <div>{emp.first_name} {emp.last_name}</div>
                    <div className="text-[9px] text-muted-foreground">{emp.venue || "—"}</div>
                  </td>
                  {weekDates.map((d, i) => {
                    const dateStr = formatDate(d);
                    const cellShifts = shiftMap[`${emp.id}_${dateStr}`] || [];
                    const isToday = dateStr === todayStr;

                    if (cellShifts.length === 0) {
                      return (
                        <td
                          key={i}
                          className={`${tdClass} text-center ${isToday ? "bg-primary/5" : ""} ${onAddShift ? "cursor-pointer group/cell hover:bg-muted/40 transition-colors" : ""}`}
                          onClick={() => onAddShift?.(emp.id, dateStr)}
                        >
                          {onAddShift ? (
                            <span className="text-muted-foreground/30 group-hover/cell:text-primary group-hover/cell:font-bold transition-colors text-xs">+</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    }

                    return (
                      <td key={i} className={`${tdClass} ${isToday ? "bg-primary/5" : ""}`}>
                        <div className="space-y-0.5">
                          {cellShifts.map(shift => {
                            const type = shift.shift_type || "regular";
                            const isRegular = type === "regular";

                            if (!isRegular) {
                              const code = TYPE_TO_CODE[type] || type.toUpperCase();
                              return (
                                <div
                                  key={shift.id}
                                  className={`rounded px-1.5 py-0.5 text-center cursor-pointer ${getLeaveStyle(type)}`}
                                  onClick={() => onEditShift(shift)}
                                >
                                  <span className="text-[10px] font-semibold">{code}</span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={shift.id}
                                className="rounded border border-border/60 px-1.5 py-1 cursor-pointer hover:bg-muted/50 transition-colors space-y-0.5"
                                onClick={() => onEditShift(shift)}
                              >
                                {/* Planned */}
                                <div className="text-muted-foreground text-[9px] leading-tight">
                                  <span className="font-medium">Plan:</span> {formatShiftTime(shift.start_time, shift.end_time)}
                                </div>
                                {/* Actual */}
                                <div className="text-foreground text-[10px] font-semibold leading-tight">
                                  <span className="font-medium text-muted-foreground text-[9px]">Act:</span>{" "}
                                  {shift.no_show ? (
                                    <span className="text-destructive">No Show</span>
                                  ) : shift.actual_start_time && shift.actual_end_time ? (
                                    formatShiftTime(shift.actual_start_time, shift.actual_end_time)
                                  ) : (
                                    <span className="text-muted-foreground/50 font-normal italic">—</span>
                                  )}
                                </div>
                                {/* Variance */}
                                <VarianceBadge
                                  plannedStart={shift.start_time}
                                  plannedEnd={shift.end_time}
                                  actualStart={shift.actual_start_time}
                                  actualEnd={shift.actual_end_time}
                                  noShow={shift.no_show}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Summary Row */}
              <tr className="bg-muted/40 border-t-2 border-border font-semibold">
                <td className={`${tdClass} sticky left-0 bg-muted/40 z-10 text-[11px] font-bold`}>Totals</td>
                {dailySummary.map((day, i) => (
                  <td key={i} className={`${tdClass} text-center`}>
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground text-[9px]">Plan: {day.plannedHrs.toFixed(1)}h</div>
                      <div className="text-foreground text-[10px]">Act: {day.actualHrs.toFixed(1)}h</div>
                      <div className={`text-[9px] font-bold ${day.variance < 0 ? "text-destructive" : day.variance > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {day.variance > 0 ? "+" : ""}{(day.variance * 60).toFixed(0)}m
                      </div>
                      {day.noShows > 0 && (
                        <div className="text-[9px] text-destructive">{day.noShows} no-show</div>
                      )}
                      {day.pending > 0 && (
                        <div className="text-[9px] text-muted-foreground italic">{day.pending} pending</div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
