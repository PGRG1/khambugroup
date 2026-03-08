import { useMemo, useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock } from "lucide-react";
import type { HRShift, HREmployee, HRLeaveRequest, HRLeaveType, HRDepartment } from "@/hooks/useHRData";

interface Props {
  shifts: HRShift[];
  employees: HREmployee[];
  departments: HRDepartment[];
  leaveRequests: HRLeaveRequest[];
  leaveTypes: HRLeaveType[];
  weekDates: Date[];
  onEditShift: (shift: HRShift) => void;
  onAddShift: (employeeId: string, date: string) => void;
  onApproveLeave?: (id: string, status: "approved" | "rejected") => void;
  onChangeVenue?: (employeeId: string, venue: string) => void;
  onReorderEmployees?: (reorderedIds: { id: string; sort_order: number }[]) => void;
}

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const VENUE_OPTIONS = [
  { value: "Caliente", label: "Caliente" },
  { value: "Assembly", label: "Assembly" },
  { value: "Caliente / Assembly", label: "Caliente / Assembly" },
  { value: "Kitchen", label: "Kitchen" },
  { value: "Support", label: "Support" },
];
const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LEGEND_ITEMS = [
  { code: "OFF", label: "Day Off", bg: "bg-muted", text: "text-muted-foreground" },
  { code: "AL", label: "Annual Leave", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400" },
  { code: "SH", label: "Statutory Holidays", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  { code: "NPL", label: "No Pay Leave", bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400" },
  { code: "SL", label: "Sick Leave", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
];

const TYPE_TO_CODE: Record<string, string> = {
  al: "AL",
  sh: "SH",
  ph: "PH",
  sick_no_pay: "SL",
  no_pay: "NPL",
  off: "OFF",
  rest: "OFF",
  training: "TRN",
};

// Color palette for venues/departments – cycles for unlimited departments
const VENUE_COLORS = [
  { bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-800 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/20", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  { bg: "bg-sky-100 dark:bg-sky-900/20", text: "text-sky-800 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800" },
  { bg: "bg-violet-100 dark:bg-violet-900/20", text: "text-violet-800 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800" },
  { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-800 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  { bg: "bg-rose-100 dark:bg-rose-900/20", text: "text-rose-800 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800" },
];

function getVenueColor(venueName: string, venueList: string[]) {
  const idx = venueList.indexOf(venueName);
  return VENUE_COLORS[idx >= 0 ? idx % VENUE_COLORS.length : 0];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function formatShiftCell(shift: HRShift): string {
  const type = shift.shift_type || "regular";
  if (type !== "regular") return TYPE_TO_CODE[type] || type.toUpperCase();
  const start = formatTime12(shift.start_time);
  const end = formatTime12(shift.end_time);
  // Show "CLS" for closing shifts (ending at or after midnight)
  const [endH] = (shift.end_time || "00:00").split(":").map(Number);
  const [startH] = (shift.start_time || "00:00").split(":").map(Number);
  if (endH >= 0 && endH <= 4 && startH >= 12) {
    return `${start} - CLS`;
  }
  return `${start} - ${end}`;
}

function getShiftCellStyle(shift: HRShift): string {
  const type = shift.shift_type || "regular";
  switch (type) {
    case "al": return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
    case "sh": case "ph": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
    case "sick_no_pay": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    case "no_pay": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400";
    case "off": case "rest": return "bg-muted text-muted-foreground";
    case "training": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
    default: return "";
  }
}

function getCategoryLabel(emp: HREmployee): string {
  const title = (emp.job_title || "").toLowerCase();
  if (title.includes("general manager") || title.includes("gm")) return "Bar & Floor";
  if (title.includes("bar") && title.includes("manager")) return "Bar";
  if (title.includes("bar")) return "Bar";
  if (title.includes("runner")) return "Runner";
  if (title.includes("kitchen") || title.includes("chef") || title.includes("cook") || title.includes("wash") || title.includes("demi")) return "Kitchen";
  if (title.includes("manager")) return "Floor";
  if (title.includes("server") || title.includes("waiter") || title.includes("waitress")) return "Floor";
  if (title.includes("promotor") || title.includes("promoter")) return "Floor";
  if (title.includes("cleaner")) return "Others";
  return "Floor";
}

function getTypeLabel(emp: HREmployee): string {
  const t = emp.employment_type;
  if (t === "full_time") return "Full-Time";
  if (t === "part_time") return "Part-Time";
  if (t === "casual") return "Casual";
  return t;
}

// Hourly coverage: count how many staff are working at each hour
function getHourlyCoverage(shifts: HRShift[], weekDates: Date[]) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 15); // 3PM to 2AM (15-26, with 24+ = next day)
  const result: { hour: number; label: string; counts: number[] }[] = [];

  for (const hour of hours) {
    const displayHour = hour >= 24 ? hour - 24 : hour;
    const suffix = displayHour >= 12 ? "PM" : "AM";
    const h12 = displayHour === 0 ? 12 : displayHour > 12 ? displayHour - 12 : displayHour;
    const label = `${h12}${suffix}`;
    const counts = weekDates.map(d => {
      const dateStr = formatDate(d);
      return shifts.filter(s => {
        if (s.shift_date !== dateStr) return false;
        if ((s.shift_type || "regular") !== "regular") return false;
        const [h1] = s.start_time.split(":").map(Number);
        const [h2] = s.end_time.split(":").map(Number);
        const endH = h2 === 0 ? 24 : h2 < h1 ? h2 + 24 : h2;
        return hour >= h1 && hour < endH;
      }).length;
    });
    result.push({ hour, label, counts });
  }
  return result;
}

export function WeeklyScheduleView({
  shifts, employees, departments, leaveRequests, leaveTypes, weekDates,
  onEditShift, onAddShift, onApproveLeave, onReorderEmployees,
}: Props) {
  const activeEmployees = useMemo(
    () => employees.filter(e => (e.status || "").trim().toLowerCase() === "active"),
    [employees]
  );

  // Local order override for optimistic drag reorder
  const [localOrderOverride, setLocalOrderOverride] = useState<string[] | null>(null);

  // Reset local override when employees prop changes (e.g. new employee added)
  const employeeIds = activeEmployees.map(e => e.id).sort().join(",");
  const prevEmployeeIds = useRef(employeeIds);
  if (prevEmployeeIds.current !== employeeIds) {
    prevEmployeeIds.current = employeeIds;
    setLocalOrderOverride(null);
  }

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const shiftMap = useMemo(() => {
    const map: Record<string, HRShift[]> = {};
    shifts.forEach(s => {
      const key = `${s.employee_id}_${s.shift_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [shifts]);

  // Staff summary by department
  const staffSummary = useMemo(() => {
    const summary: Record<string, { ft: number; pt: number }> = {};
    activeEmployees.forEach(emp => {
      const venue = emp.venue || "Other";
      if (!summary[venue]) summary[venue] = { ft: 0, pt: 0 };
      if (emp.employment_type === "full_time") summary[venue].ft++;
      else summary[venue].pt++;
    });
    return summary;
  }, [activeEmployees]);

  // Pending leave requests for the week
  const weekLeaveRequests = useMemo(() => {
    const weekStart = formatDate(weekDates[0]);
    const weekEnd = formatDate(weekDates[6]);
    const activeEmployeeIds = new Set(activeEmployees.map(emp => emp.id));

    return leaveRequests.filter(lr =>
      activeEmployeeIds.has(lr.employee_id) &&
      lr.status === "pending" &&
      lr.start_date <= weekEnd &&
      lr.end_date >= weekStart
    );
  }, [leaveRequests, weekDates, activeEmployees]);

  // Daily headcount by department
  const dailyHeadcount = useMemo(() => {
    const venues = [...new Set(activeEmployees.map(e => e.venue || "Other"))];
    return venues.map(venue => {
      const venueEmps = activeEmployees.filter(e => (e.venue || "Other") === venue);
      const counts = weekDates.map(d => {
        const dateStr = formatDate(d);
        return venueEmps.filter(emp => {
          const cellShifts = shiftMap[`${emp.id}_${dateStr}`] || [];
          return cellShifts.some(s => (s.shift_type || "regular") === "regular");
        }).length;
      });
      return { dept: venue, counts };
    });
  }, [activeEmployees, weekDates, shiftMap]);

  const dailyTotals = useMemo(() =>
    weekDates.map((_, i) => dailyHeadcount.reduce((t, row) => t + row.counts[i], 0)),
    [dailyHeadcount, weekDates]
  );

  const hourlyCoverage = useMemo(() => getHourlyCoverage(shifts, weekDates), [shifts, weekDates]);

  const weekPeriod = `Week of ${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${weekDates[6].toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
  const todayStr = formatDate(new Date());

  // Stable venue list for color assignment
  const venueList = useMemo(() => {
    const names = [...new Set(activeEmployees.map(e => e.venue || "Other"))];
    return names.sort();
  }, [activeEmployees]);

  // Sort employees by sort_order (persisted), then venue, then name as fallback
  const baseSortedEmployees = useMemo(() =>
    [...activeEmployees].sort((a, b) => {
      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      const vA = a.venue || "ZZZ";
      const vB = b.venue || "ZZZ";
      if (vA !== vB) return vA.localeCompare(vB);
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    }),
    [activeEmployees]
  );

  // Apply local order override if present
  const sortedEmployees = useMemo(() => {
    if (!localOrderOverride) return baseSortedEmployees;
    const empMap = new Map(baseSortedEmployees.map(e => [e.id, e]));
    const ordered = localOrderOverride.map(id => empMap.get(id)).filter(Boolean) as typeof baseSortedEmployees;
    // Add any employees not in the override (newly added)
    baseSortedEmployees.forEach(e => { if (!localOrderOverride.includes(e.id)) ordered.push(e); });
    return ordered;
  }, [baseSortedEmployees, localOrderOverride]);

  // Drag handlers for row reordering
  const handleDragStart = useCallback((e: React.DragEvent<HTMLTableRowElement>, empId: string) => {
    setDraggedId(empId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", empId);
    if (e.currentTarget) {
      e.currentTarget.style.opacity = "0.4";
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLTableRowElement>) => {
    e.currentTarget.style.opacity = "1";
    setDraggedId(null);
    setDragOverId(null);
    dragCounter.current = 0;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLTableRowElement>, empId: string) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverId(empId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLTableRowElement>) => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverId(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    dragCounter.current = 0;
    const sourceId = draggedId;
    setDraggedId(null);
    if (!sourceId || sourceId === targetId || !onReorderEmployees) return;

    const currentOrder = [...sortedEmployees];
    const srcIdx = currentOrder.findIndex(emp => emp.id === sourceId);
    const tgtIdx = currentOrder.findIndex(emp => emp.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = currentOrder.splice(srcIdx, 1);
    currentOrder.splice(tgtIdx, 0, moved);

    // Optimistic local update — no refetch needed
    setLocalOrderOverride(currentOrder.map(e => e.id));

    // Persist to DB in background
    const updates = currentOrder.map((emp, i) => ({ id: emp.id, sort_order: i }));
    onReorderEmployees(updates);
  }, [draggedId, sortedEmployees, onReorderEmployees]);

  const thClass = "px-2 py-1.5 text-[11px] font-semibold text-left whitespace-nowrap";
  const tdClass = "px-2 py-1 text-[11px] whitespace-nowrap border-r border-border/40 last:border-r-0";
  const sectionHeaderClass = "text-xs font-bold uppercase tracking-wider px-2 py-1.5 bg-foreground text-background";

  return (
    <div className="space-y-4 text-[11px]">
      {/* Period Label */}
      <p className="text-sm italic text-muted-foreground">
        <span className="font-semibold">Period:</span> {weekPeriod}
      </p>

      {/* Row 1: Staff Summary + Legend */}
      <div className="flex gap-6 flex-wrap">
        {/* Staff Summary */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className={sectionHeaderClass}>Staff Summary</div>
          <table className="text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={thClass}>Venue</th>
                <th className={`${thClass} text-center`}>Full-Time</th>
                <th className={`${thClass} text-center`}>Part-Time</th>
                <th className={`${thClass} text-center font-bold`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(staffSummary).map(([dept, { ft, pt }]) => {
                const vc = getVenueColor(dept, venueList);
                return (
                  <tr key={dept} className={`border-b border-border/50 ${vc.bg}`}>
                    <td className={`${tdClass} font-bold ${vc.text}`}>{dept}</td>
                    <td className={`${tdClass} text-center`}>{ft}</td>
                    <td className={`${tdClass} text-center`}>{pt}</td>
                    <td className={`${tdClass} text-center font-bold`}>{ft + pt}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/50 font-bold">
                <td className={tdClass}>Total</td>
                <td className={`${tdClass} text-center`}>{Object.values(staffSummary).reduce((t, v) => t + v.ft, 0)}</td>
                <td className={`${tdClass} text-center`}>{Object.values(staffSummary).reduce((t, v) => t + v.pt, 0)}</td>
                <td className={`${tdClass} text-center`}>{activeEmployees.length}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className={sectionHeaderClass}>Legend</div>
          <div className="p-2 space-y-1">
            {LEGEND_ITEMS.map(item => (
              <div key={item.code} className="flex items-center gap-2">
                <span className={`inline-block w-10 text-center text-[10px] font-bold rounded px-1 py-0.5 ${item.bg} ${item.text}`}>
                  {item.code}
                </span>
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee Requests */}
      {weekLeaveRequests.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className={sectionHeaderClass}>Employee Requests</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={thClass}>S.No.</th>
                <th className={thClass}>Name</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Day</th>
                <th className={thClass}>Request</th>
                <th className={thClass}>Reason</th>
                <th className={thClass}>Response</th>
              </tr>
            </thead>
            <tbody>
              {weekLeaveRequests.map((lr, idx) => {
                const emp = employees.find(e => e.id === lr.employee_id);
                const lt = leaveTypes.find(t => t.id === lr.leave_type_id);
                const startDate = new Date(lr.start_date + "T00:00:00");
                const dayName = DAY_NAMES_SHORT[startDate.getDay() === 0 ? 6 : startDate.getDay() - 1];
                return (
                  <tr key={lr.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className={tdClass}>{idx + 1}</td>
                    <td className={`${tdClass} font-medium`}>{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</td>
                    <td className={tdClass}>{startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className={tdClass}>{dayName}</td>
                    <td className={tdClass}>{lt ? (TYPE_TO_CODE[lt.name.toLowerCase()] || lt.name) : "—"}</td>
                    <td className={tdClass}>{lr.reason || "—"}</td>
                    <td className={tdClass}>
                      {onApproveLeave ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-green-600 hover:text-green-700" onClick={() => onApproveLeave(lr.id, "approved")}>
                            <Check className="h-3 w-3 mr-0.5" /> Accept
                          </Button>
                          <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-destructive hover:text-destructive" onClick={() => onApproveLeave(lr.id, "rejected")}>
                            <X className="h-3 w-3 mr-0.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Pending</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff Roster - Main Grid */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className={sectionHeaderClass}>Staff Roster</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={`${thClass} sticky left-0 bg-muted/50 z-10 min-w-[80px]`}>Venue</th>
                <th className={`${thClass} min-w-[90px]`}>Name</th>
                <th className={`${thClass} min-w-[80px]`}>Position</th>
                <th className={`${thClass} min-w-[60px]`}>Type</th>
                <th className={`${thClass} min-w-[55px]`}>Category</th>
                {weekDates.map((d, i) => {
                  const isToday = formatDate(d) === todayStr;
                  return (
                    <th key={i} className={`${thClass} text-center min-w-[80px] ${isToday ? "bg-primary/10" : ""}`}>
                      <div>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      <div className="font-normal text-[10px]">{DAY_NAMES[i]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.length === 0 ? (
                <tr><td colSpan={12} className="text-center text-muted-foreground py-6">No active employees</td></tr>
              ) : sortedEmployees.map(emp => {
                const vc = getVenueColor(emp.venue || "Other", venueList);
                const isDragged = draggedId === emp.id;
                const isDragOver = dragOverId === emp.id && draggedId !== emp.id;
                return (
                <tr
                  key={emp.id}
                  draggable={!!onReorderEmployees}
                  onDragStart={e => handleDragStart(e, emp.id)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={e => handleDragEnter(e, emp.id)}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, emp.id)}
                  className={`border-b border-border/50 hover:bg-muted/20 transition-all ${onReorderEmployees ? "cursor-grab active:cursor-grabbing" : ""} ${isDragged ? "opacity-40" : ""} ${isDragOver ? "border-t-2 border-t-primary" : ""}`}
                >
                  <td className={`${tdClass} font-bold sticky left-0 z-10 ${vc.bg} ${vc.text}`}>
                    {emp.venue || "—"}
                  </td>
                  <td className={`${tdClass} font-medium`}>{emp.first_name} {emp.last_name}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{emp.job_title || "—"}</td>
                  <td className={tdClass}>{getTypeLabel(emp)}</td>
                  <td className={tdClass}>{getCategoryLabel(emp)}</td>
                  {weekDates.map((d, i) => {
                    const dateStr = formatDate(d);
                    const isToday = dateStr === todayStr;
                    const cellShifts = shiftMap[`${emp.id}_${dateStr}`] || [];

                    if (cellShifts.length === 0) {
                      return (
                        <td key={i} className={`${tdClass} text-center ${isToday ? "bg-primary/5" : ""}`}>
                          <button
                            onClick={() => onAddShift(emp.id, dateStr)}
                            className="w-full text-muted-foreground/30 hover:text-primary/50 transition-colors"
                          >
                            -
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td key={i} className={`${tdClass} text-center ${isToday ? "bg-primary/5" : ""}`}>
                        {cellShifts.map(s => (
                          <button
                            key={s.id}
                            onClick={() => onEditShift(s)}
                            className={`block w-full rounded px-0.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity font-medium ${getShiftCellStyle(s)} ${s.no_show ? "line-through opacity-60" : ""}`}
                          >
                            {formatShiftCell(s)}
                          </button>
                        ))}
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

      {/* Daily Headcount */}
      {dailyHeadcount.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className={sectionHeaderClass}>Daily Headcount</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={`${thClass} min-w-[80px]`}>Venue</th>
                  {weekDates.map((d, i) => {
                    const isToday = formatDate(d) === todayStr;
                    return (
                      <th key={i} className={`${thClass} text-center min-w-[60px] ${isToday ? "bg-primary/10" : ""}`}>
                        <div>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        <div className="font-normal text-[10px]">{DAY_NAMES[i]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {dailyHeadcount.map(row => {
                  const vc = getVenueColor(row.dept, venueList);
                  return (
                  <tr key={row.dept} className={`border-b border-border/50 ${vc.bg}`}>
                    <td className={`${tdClass} font-bold ${vc.text}`}>{row.dept}</td>
                    {row.counts.map((c, i) => {
                      const isToday = formatDate(weekDates[i]) === todayStr;
                      return (
                        <td key={i} className={`${tdClass} text-center font-medium ${isToday ? "bg-primary/5" : ""}`}>{c}</td>
                      );
                    })}
                  </tr>
                  );
                })}
                <tr className="bg-muted/50 font-bold">
                  <td className={tdClass}>Total</td>
                  {dailyTotals.map((t, i) => (
                    <td key={i} className={`${tdClass} text-center`}>{t}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hourly Coverage */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className={sectionHeaderClass}>Hourly Coverage (Total)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={`${thClass} min-w-[60px]`}>Hour</th>
                {weekDates.map((d, i) => {
                  const isToday = formatDate(d) === todayStr;
                  return (
                    <th key={i} className={`${thClass} text-center min-w-[60px] ${isToday ? "bg-primary/10" : ""}`}>
                      <div>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      <div className="font-normal text-[10px]">{DAY_NAMES[i]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {hourlyCoverage.map(row => (
                <tr key={row.hour} className="border-b border-border/50 hover:bg-muted/30">
                  <td className={`${tdClass} font-medium`}>{row.label}</td>
                  {row.counts.map((c, i) => {
                    const isToday = formatDate(weekDates[i]) === todayStr;
                    return (
                      <td key={i} className={`${tdClass} text-center ${isToday ? "bg-primary/5" : ""} ${c === 0 ? "text-muted-foreground/40" : "font-medium"}`}>{c}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
