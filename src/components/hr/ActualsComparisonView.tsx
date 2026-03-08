import { useMemo } from "react";
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
  al: "AL", sh: "SH", ph: "PH", sick_no_pay: "SL", no_pay: "NPL", off: "OFF", rest: "OFF", unscheduled: "—",
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

function crossesMidnight(startTime: string, endTime: string): boolean {
  const [sh] = startTime.split(":").map(Number);
  const [eh] = endTime.split(":").map(Number);
  return eh < sh || (eh === sh && endTime < startTime);
}

function formatShiftTime(start: string, end: string): string {
  const plus1 = crossesMidnight(start, end) ? " +1" : "";
  return `${formatTime12(start)} - ${formatTime12(end)}${plus1}`;
}

function getShiftCellStyle(type: string): string {
  switch (type) {
    case "unscheduled": return "text-muted-foreground/40";
    case "al": return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
    case "sh": case "ph": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
    case "sick_no_pay": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    case "no_pay": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400";
    case "off": case "rest": return "bg-muted text-muted-foreground";
    case "training": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
    default: return "";
  }
}

function formatCellContent(type: string, startTime: string, endTime: string): string {
  if (type === "unscheduled") return "—";
  if (type !== "regular") return TYPE_TO_CODE[type] || type.toUpperCase();
  const plus1 = crossesMidnight(startTime, endTime) ? " +1" : "";
  return `${formatTime12(startTime)} - ${formatTime12(endTime)}${plus1}`;
}

/** Check if actuals differ from plan */
function isChanged(shift: HRShift): boolean {
  const actualType = shift.actual_shift_type;
  if (!actualType) return false; // no actuals recorded = default to plan = not changed
  const plannedType = shift.shift_type || "regular";
  // Type changed
  if (actualType !== plannedType) return true;
  // Both regular but times differ
  if (actualType === "regular" && (
    (shift.actual_start_time && shift.actual_start_time !== shift.start_time) ||
    (shift.actual_end_time && shift.actual_end_time !== shift.end_time)
  )) return true;
  return false;
}

/** Get the display type & times for actuals (defaults to plan if no actuals) */
function getActualDisplay(shift: HRShift): { type: string; start: string; end: string } {
  const actualType = shift.actual_shift_type || shift.shift_type || "regular";
  const start = shift.actual_start_time || shift.start_time;
  const end = shift.actual_end_time || shift.end_time;
  return { type: actualType, start, end };
}

// Color palette for venues — same as WeeklyScheduleView
const VENUE_COLORS = [
  { bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-800 dark:text-orange-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/20", text: "text-emerald-800 dark:text-emerald-300" },
  { bg: "bg-sky-100 dark:bg-sky-900/20", text: "text-sky-800 dark:text-sky-300" },
  { bg: "bg-violet-100 dark:bg-violet-900/20", text: "text-violet-800 dark:text-violet-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-800 dark:text-amber-300" },
  { bg: "bg-rose-100 dark:bg-rose-900/20", text: "text-rose-800 dark:text-rose-300" },
];

function getVenueColor(venueName: string, venueList: string[]) {
  const idx = venueList.indexOf(venueName);
  return VENUE_COLORS[idx >= 0 ? idx % VENUE_COLORS.length : 0];
}

export function ActualsComparisonView({ shifts, employees, holidays, weekDates, onEditShift }: Props) {
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

  const thClass = "px-1.5 py-1.5 text-[10px] font-semibold whitespace-nowrap text-left";
  const tdClass = "px-1.5 py-1 text-[10px] whitespace-nowrap border-r border-border/40 last:border-r-0";

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={`${thClass} sticky left-0 bg-muted/50 z-10 min-w-[80px]`}>Venue</th>
                <th className={`${thClass} min-w-[90px]`}>Name</th>
                <th className={`${thClass} min-w-[80px]`}>Position</th>
                {weekDates.map((d, i) => {
                  const isHoliday = holidayDates.has(formatDate(d));
                  const isToday = formatDate(d) === todayStr;
                  return (
                    <th key={i} className={`${thClass} text-center min-w-[80px] ${isHoliday ? "bg-muted/60" : ""} ${isToday ? "bg-primary/10" : ""}`}>
                      <div>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      <div className="font-normal text-[10px]">{DAY_NAMES[i]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeEmployees.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-muted-foreground py-6">No active employees</td></tr>
              ) : activeEmployees.map(emp => {
                const vc = getVenueColor(emp.venue || "Other");
                return (
                  <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className={`${tdClass} font-bold sticky left-0 z-10 ${vc.bg} ${vc.text}`}>
                      {emp.venue || "—"}
                    </td>
                    <td className={`${tdClass} font-medium`}>{emp.first_name} {emp.last_name}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{emp.job_title || "—"}</td>
                    {weekDates.map((d, i) => {
                      const dateStr = formatDate(d);
                      const isHoliday = holidayDates.has(dateStr);
                      const isToday = dateStr === todayStr;
                      const cellShifts = shiftMap[`${emp.id}_${dateStr}`] || [];

                      if (cellShifts.length === 0) {
                        return (
                          <td key={i} className={`${tdClass} text-center ${isHoliday ? "bg-muted/40" : ""} ${isToday ? "bg-primary/5" : ""}`}>
                            <span className="text-muted-foreground/40">—</span>
                          </td>
                        );
                      }

                      return (
                        <td key={i} className={`${tdClass} text-center ${isHoliday ? "bg-muted/40" : ""} ${isToday ? "bg-primary/5" : ""}`}>
                          {cellShifts.map(shift => {
                            const changed = isChanged(shift);
                            const { type, start, end } = getActualDisplay(shift);
                            const cellText = formatCellContent(type, start, end);
                            const style = getShiftCellStyle(type);

                            return (
                              <button
                                key={shift.id}
                                onClick={() => onEditShift(shift)}
                                className={`relative block w-full rounded px-0.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity font-medium ${style} ${
                                  changed ? "ring-2 ring-destructive/60 bg-destructive/10" : ""
                                }`}
                                title={changed ? "Modified from plan" : "Same as planned"}
                              >
                                {cellText}
                              </button>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
