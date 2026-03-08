import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, Plus, Copy, Clock, Users, CalendarDays, AlertTriangle, TrendingDown, BarChart3, ClipboardList, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { HRShift, HRAttendance, HREmployee } from "@/hooks/useHRData";
import { WeeklyScheduleView } from "./WeeklyScheduleView";
import { ActualsComparisonView } from "./ActualsComparisonView";
import { TimeGridPicker } from "./TimeGridPicker";

interface Props {
  shifts: HRShift[];
  attendance: HRAttendance[];
  employees: HREmployee[];
  departments?: import("@/hooks/useHRData").HRDepartment[];
  leaveRequests?: import("@/hooks/useHRData").HRLeaveRequest[];
  leaveTypes?: import("@/hooks/useHRData").HRLeaveType[];
  holidays?: import("@/hooks/useHRData").HRHoliday[];
  onSaveShift: (s: Partial<HRShift>) => Promise<boolean>;
  onSaveAttendance: (a: Partial<HRAttendance>) => Promise<boolean>;
  onSaveLeaveRequest?: (lr: Partial<import("@/hooks/useHRData").HRLeaveRequest>) => Promise<boolean>;
  onRefetch?: () => Promise<void>;
}

const VENUE_OPTIONS = [
  { value: "Caliente", label: "Caliente" },
  { value: "Assembly", label: "Assembly" },
  { value: "Caliente / Assembly", label: "Caliente / Assembly" },
  { value: "Kitchen", label: "Kitchen" },
  { value: "Support", label: "Support" },
];

const SHIFT_TYPES = [
  { value: "unscheduled", label: "—", color: "bg-muted/50 text-muted-foreground border-border" },
  { value: "regular", label: "Work", color: "bg-primary/20 text-primary border-primary/30" },
  { value: "off", label: "OFF", color: "bg-muted text-muted-foreground border-border" },
  { value: "al", label: "AL", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700" },
  { value: "sh", label: "SH", color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700" },
  { value: "no_pay", label: "NPL", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700" },
  { value: "sick_no_pay", label: "SL", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700" },
];

const SHIFT_STATUSES = [
  { value: "completed", label: "Completed as Planned", group: "top" },
  { value: "no_show", label: "Not Completed as Planned", group: "top" },
  { value: "scheduled", label: "Work", group: "bottom" },
  { value: "off", label: "OFF", group: "bottom" },
  { value: "al", label: "AL", group: "bottom" },
  { value: "sh", label: "SH", group: "bottom" },
  { value: "no_pay", label: "NPL", group: "bottom" },
  { value: "sick_leave", label: "SL", group: "bottom" },
];

// Generate time options in 30-min increments, ordered from 8:00 AM to 7:30 AM +1
const ACTUAL_TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 8; h <= 32; h++) {
    for (const m of [0, 30]) {
      const hour24 = h % 24;
      const val = `${String(hour24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const h12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      const suffix = hour24 >= 12 ? "PM" : "AM";
      const base = m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
      const label = h >= 24 ? `${base} +1` : base;
      opts.push({ value: val, label });
    }
  }
  return opts;
})();

function crossesMidnight(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false;
  const [sh] = startTime.split(":").map(Number);
  const [eh] = endTime.split(":").map(Number);
  return eh < sh || (eh === sh && endTime < startTime);
}

function formatTime12WithPlus1(t: string, refStart?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const base = m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  if (refStart && crossesMidnight(refStart, t)) return `${base} +1`;
  return base;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Time slots for the drag grid (hourly from 6AM to midnight)
const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const hour = i + 6;
  return { hour, label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? "PM" : "AM"}` };
});

function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function calcHours(start: string, end: string, _breakMin: number): number {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function padTime(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// --- KPI Cards with enhanced metrics ---
function ScheduleKPICards({ shifts, weekDates, employees }: { shifts: HRShift[]; weekDates: Date[]; employees: HREmployee[] }) {
  const stats = useMemo(() => {
    const weekKeys = new Set(weekDates.map(formatDate));
    const weekShifts = shifts.filter(s => weekKeys.has(s.shift_date));
    const regularShifts = weekShifts.filter(s => s.shift_type === "regular" || !s.shift_type);
    const scheduledHrs = regularShifts.reduce((t, s) => t + calcHours(s.start_time, s.end_time, s.break_minutes || 0), 0);
    const actualHrs = weekShifts.reduce((t, s) => t + (Number(s.actual_hours_worked) || 0), 0);
    const noShows = weekShifts.filter(s => s.no_show).length;
    const leaveCounts: Record<string, number> = {};
    weekShifts.filter(s => ["al", "sh", "ph", "sick_no_pay", "no_pay"].includes(s.shift_type || "")).forEach(s => {
      leaveCounts[s.shift_type!] = (leaveCounts[s.shift_type!] || 0) + 1;
    });
    const totalLeave = Object.values(leaveCounts).reduce((a, b) => a + b, 0);
    const totalScheduled = regularShifts.length;
    const completed = weekShifts.filter(s => s.status === "completed").length;
    const attendanceRate = totalScheduled > 0 ? ((totalScheduled - noShows) / totalScheduled * 100) : 100;

    // Hours by employee
    const hrsByEmployee: Record<string, number> = {};
    weekShifts.forEach(s => {
      const hrs = (s.shift_type === "regular" || !s.shift_type) ? calcHours(s.start_time, s.end_time, s.break_minutes || 0) : 0;
      hrsByEmployee[s.employee_id] = (hrsByEmployee[s.employee_id] || 0) + hrs;
    });

    // Hours by position
    const hrsByPosition: Record<string, number> = {};
    weekShifts.forEach(s => {
      const emp = employees.find(e => e.id === s.employee_id);
      const pos = emp?.job_title || "Unassigned";
      const hrs = (s.shift_type === "regular" || !s.shift_type) ? calcHours(s.start_time, s.end_time, s.break_minutes || 0) : 0;
      hrsByPosition[pos] = (hrsByPosition[pos] || 0) + hrs;
    });

    // Payroll-impacting days
    const payrollImpactDays = weekShifts.filter(s => ["sick_no_pay", "no_pay"].includes(s.shift_type || "")).length;

    return { scheduledHrs, actualHrs, noShows, totalLeave, leaveCounts, attendanceRate, hrsByEmployee, hrsByPosition, payrollImpactDays };
  }, [shifts, weekDates, employees]);

  const cards = [
    { label: "Scheduled Hours", value: `${stats.scheduledHrs.toFixed(1)}h`, icon: Clock, color: "text-primary" },
    { label: "Actual Hours", value: `${stats.actualHrs.toFixed(1)}h`, icon: Clock, color: "text-chart-3" },
    { label: "Attendance Rate", value: `${stats.attendanceRate.toFixed(0)}%`, icon: Users, color: "text-chart-2" },
    { label: "No Shows", value: String(stats.noShows), icon: AlertTriangle, color: "text-destructive" },
    { label: "Leave Days", value: String(stats.totalLeave), icon: CalendarDays, color: "text-chart-4" },
    { label: "Variance", value: `${(stats.actualHrs - stats.scheduledHrs).toFixed(1)}h`, icon: TrendingDown, color: stats.actualHrs < stats.scheduledHrs ? "text-destructive" : "text-primary" },
    { label: "Payroll Impact", value: `${stats.payrollImpactDays}d`, icon: BarChart3, color: "text-destructive" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map(c => (
          <div key={c.label} className="card-glass rounded-xl p-3 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-1">
              <c.icon className={`h-3.5 w-3.5 shrink-0 ${c.color}`} />
              <span className="text-[11px] text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-sm font-display font-bold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Leave breakdown + Hours by position */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(stats.leaveCounts).length > 0 && Object.entries(stats.leaveCounts).map(([type, count]) => (
          <div key={type} className="card-glass rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{SHIFT_TYPES.find(t => t.value === type)?.label || type}</Badge>
            <span className="text-xs font-semibold">{count}</span>
          </div>
        ))}
        {Object.entries(stats.hrsByPosition).length > 0 && Object.entries(stats.hrsByPosition).map(([pos, hrs]) => (
          <div key={pos} className="card-glass rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{pos}:</span>
            <span className="text-xs font-semibold">{hrs.toFixed(1)}h</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type ShiftClipboard = { shift_type: string; start_time: string; end_time: string } | null;

export function AttendanceTab({ shifts, attendance, employees, departments, leaveRequests, leaveTypes, holidays, onSaveShift, onSaveAttendance, onSaveLeaveRequest, onRefetch }: Props) {
  const [viewMode, setViewMode] = useState<"plan" | "actuals">("plan");
  const [weekBase, setWeekBase] = useState(new Date());
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Partial<HRShift> | null>(null);
  const [shiftVenue, setShiftVenue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [clipboard, setClipboard] = useState<ShiftClipboard>(null);
  const [copyPrevConfirmOpen, setCopyPrevConfirmOpen] = useState(false);
  const [copyingPrev, setCopyingPrev] = useState(false);
  const [modalActualsMode, setModalActualsMode] = useState(false);

  // Drag state for time-grid
  const [dragState, setDragState] = useState<{
    employeeId: string;
    dayIndex: number;
    startHour: number;
    currentHour: number;
  } | null>(null);
  const isDragging = useRef(false);

  const activeEmployees = useMemo(
    () => employees.filter(e => (e.status || "").trim().toLowerCase() === "active"),
    [employees]
  );
  const weekDates = useMemo(() => getWeekDates(weekBase), [weekBase]);

  const prevWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); };
  const nextWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); };
  const goToday = () => setWeekBase(new Date());

  // --- Copy Previous Week ---
  const prevWeekDates = useMemo(() => {
    const d = new Date(weekBase);
    d.setDate(d.getDate() - 7);
    return getWeekDates(d);
  }, [weekBase]);

  const prevWeekShifts = useMemo(() => {
    const keys = new Set(prevWeekDates.map(formatDate));
    return shifts.filter(s => keys.has(s.shift_date));
  }, [shifts, prevWeekDates]);

  const currentWeekKeys = useMemo(() => {
    const existing = new Set<string>();
    const weekKeys = new Set(weekDates.map(formatDate));
    shifts.filter(s => weekKeys.has(s.shift_date)).forEach(s => {
      existing.add(`${s.employee_id}_${s.shift_date}`);
    });
    return existing;
  }, [shifts, weekDates]);

  const shiftsToCopy = useMemo(() => {
    return prevWeekShifts.filter(s => {
      const oldDate = new Date(s.shift_date + "T00:00:00");
      oldDate.setDate(oldDate.getDate() + 7);
      const newDateStr = formatDate(oldDate);
      return !currentWeekKeys.has(`${s.employee_id}_${newDateStr}`);
    });
  }, [prevWeekShifts, currentWeekKeys]);

  const handleCopyPrevWeek = async () => {
    setCopyingPrev(true);
    let count = 0;
    for (const s of shiftsToCopy) {
      const oldDate = new Date(s.shift_date + "T00:00:00");
      oldDate.setDate(oldDate.getDate() + 7);
      const newDateStr = formatDate(oldDate);
      const ok = await onSaveShift({
        employee_id: s.employee_id,
        shift_date: newDateStr,
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: 0,
        shift_type: s.shift_type,
        status: "scheduled",
        no_show: false,
      });
      if (ok) count++;
    }
    toast({ title: `Copied ${count} shifts from previous week` });
    setCopyPrevConfirmOpen(false);
    setCopyingPrev(false);
  };

  // --- Clipboard handlers ---
  const handleCopyShift = useCallback((shift: HRShift) => {
    setClipboard({ shift_type: shift.shift_type, start_time: shift.start_time, end_time: shift.end_time });
    toast({ title: "Shift copied", description: "Click any cell to paste" });
  }, []);

  const handlePasteShift = useCallback(async (employeeId: string, date: string) => {
    if (!clipboard) return;
    const ok = await onSaveShift({
      employee_id: employeeId,
      shift_date: date,
      start_time: clipboard.start_time,
      end_time: clipboard.end_time,
      break_minutes: 0,
      shift_type: clipboard.shift_type,
      status: "scheduled",
      no_show: false,
    });
    if (ok) toast({ title: "Shift pasted" });
  }, [clipboard, onSaveShift]);

  // Clear clipboard on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setClipboard(null);
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const shiftMap = useMemo(() => {
    const map: Record<string, HRShift[]> = {};
    shifts.forEach(s => {
      const key = `${s.employee_id}_${s.shift_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [shifts]);

  const openNewShift = (employeeId: string, date: string, startTime?: string, endTime?: string) => {
    setEditingShift({
      employee_id: employeeId,
      shift_date: date,
      start_time: startTime || "09:00",
      end_time: endTime || "17:00",
      break_minutes: 0,
      status: "scheduled",
      shift_type: startTime ? "regular" : "unscheduled",
      no_show: false,
    });
    const emp = employees.find(e => e.id === employeeId);
    setShiftVenue(emp?.venue || "");
    setShiftModalOpen(true);
  };

  const openEditShift = (shift: HRShift, fromActuals = false) => {
    setEditingShift({
      ...shift,
      break_minutes: 0,
      actual_break_minutes: 0,
      actual_shift_type: shift.actual_shift_type || shift.shift_type || "regular",
      status: shift.status === "scheduled" ? "completed" : shift.status,
    });
    const emp = employees.find(e => e.id === shift.employee_id);
    setShiftVenue(emp?.venue || "");
    setModalActualsMode(fromActuals);
    setShiftModalOpen(true);
  };

  const handleSaveShift = async () => {
    if (!editingShift?.employee_id || !editingShift?.shift_date) return;
    setSaving(true);
    // Update employee venue if changed
    const emp = employees.find(e => e.id === editingShift.employee_id);
    if (emp && shiftVenue && shiftVenue !== (emp.venue || "")) {
      await supabase.from("hr_employees").update({ venue: shiftVenue } as any).eq("id", emp.id);
    }
    const payload = { ...editingShift, break_minutes: 0, actual_break_minutes: 0 };
    if (payload.actual_start_time && payload.actual_end_time) {
      payload.actual_hours_worked = calcHours(payload.actual_start_time, payload.actual_end_time, payload.actual_break_minutes || 0);
      const scheduledMins = calcHours(payload.start_time || "00:00", payload.end_time || "00:00", payload.break_minutes || 0) * 60;
      const actualMins = payload.actual_hours_worked * 60;
      payload.variance_minutes = Math.round(actualMins - scheduledMins);
    }
    const ok = await onSaveShift(payload);
    if (ok) { toast({ title: "Shift saved" }); setShiftModalOpen(false); }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => setEditingShift(p => p ? { ...p, [field]: value } : p);

  const getShiftTypeStyle = (type: string) => SHIFT_TYPES.find(t => t.value === type)?.color || SHIFT_TYPES[0].color;
  const getShiftTypeLabel = (type: string) => SHIFT_TYPES.find(t => t.value === type)?.label || type;

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // --- Drag-to-schedule handlers ---
  const handleDragStart = useCallback((employeeId: string, dayIndex: number, hour: number) => {
    isDragging.current = true;
    setDragState({ employeeId, dayIndex, startHour: hour, currentHour: hour });
  }, []);

  const handleDragMove = useCallback((hour: number) => {
    if (!isDragging.current || !dragState) return;
    setDragState(prev => prev ? { ...prev, currentHour: hour } : prev);
  }, [dragState]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current || !dragState) return;
    isDragging.current = false;
    const { employeeId, dayIndex, startHour, currentHour } = dragState;
    const minH = Math.min(startHour, currentHour);
    const maxH = Math.max(startHour, currentHour) + 1;
    if (maxH - minH >= 1) {
      const dateStr = formatDate(weekDates[dayIndex]);
      openNewShift(employeeId, dateStr, padTime(minH), padTime(maxH));
    }
    setDragState(null);
  }, [dragState, weekDates]);

  const isInDragRange = (employeeId: string, dayIndex: number, hour: number) => {
    if (!dragState || dragState.employeeId !== employeeId || dragState.dayIndex !== dayIndex) return false;
    const minH = Math.min(dragState.startHour, dragState.currentHour);
    const maxH = Math.max(dragState.startHour, dragState.currentHour);
    return hour >= minH && hour <= maxH;
  };

  // Check if a shift covers a time slot
  const getShiftAtSlot = (employeeId: string, dateStr: string, hour: number): HRShift | null => {
    const cellShifts = shiftMap[`${employeeId}_${dateStr}`] || [];
    return cellShifts.find(s => {
      if (s.shift_type !== "regular" && s.shift_type) return false;
      const [h1] = s.start_time.split(":").map(Number);
      const [h2] = s.end_time.split(":").map(Number);
      const endH = h2 === 0 ? 24 : h2;
      return hour >= h1 && hour < endH;
    }) || null;
  };

  return (
    <div className="space-y-4">
      <ScheduleKPICards shifts={shifts} weekDates={weekDates} employees={employees} />

      {/* View Mode Toggle + Week Navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "plan" | "actuals")} className="bg-muted rounded-lg p-0.5">
            <ToggleGroupItem value="plan" className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
              <Calendar className="h-3.5 w-3.5" />
              Plan
            </ToggleGroupItem>
            <ToggleGroupItem value="actuals" className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
              <ClipboardList className="h-3.5 w-3.5" />
              Actuals
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold min-w-[180px] text-center">{weekLabel}</span>
            <Button variant="outline" size="icon" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
            {formatDate(weekDates[0]) !== formatDate(getWeekDates(new Date())[0]) && (
              <Button variant="ghost" size="sm" onClick={goToday} className="text-xs text-muted-foreground">
                ↺ Current
              </Button>
            )}
          </div>
        </div>
        {viewMode === "plan" && (
          <div className="flex items-center gap-2">
            {clipboard && (
              <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 rounded-md px-2 py-1">
                <Copy className="h-3 w-3" />
                <span>Shift copied — click cell to paste</span>
                <button onClick={() => setClipboard(null)} className="text-muted-foreground hover:text-foreground ml-1">✕</button>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => setCopyPrevConfirmOpen(true)} disabled={shiftsToCopy.length === 0}>
              <Copy className="h-4 w-4 mr-1" /> Copy Previous Week {shiftsToCopy.length > 0 && `(${shiftsToCopy.length})`}
            </Button>
            <Button size="sm" onClick={() => openNewShift("", formatDate(weekDates[0]))}>
              <Plus className="h-4 w-4 mr-1" /> Add Shift
            </Button>
          </div>
        )}
      </div>

      {viewMode === "plan" ? (
        <WeeklyScheduleView
          shifts={shifts}
          employees={employees}
          departments={departments || []}
          leaveRequests={leaveRequests || []}
          leaveTypes={leaveTypes || []}
          holidays={holidays || []}
          weekDates={weekDates}
          onEditShift={openEditShift}
          onAddShift={openNewShift}
          clipboard={clipboard}
          onCopyShift={handleCopyShift}
          onPasteShift={handlePasteShift}
          onApproveLeave={onSaveLeaveRequest ? async (id, status) => {
            await onSaveLeaveRequest({ id, status });
          } : undefined}
          onReorderEmployees={async (updates) => {
            const promises = updates.map(u =>
              supabase.from("hr_employees").update({ sort_order: u.sort_order } as any).eq("id", u.id)
            );
            await Promise.all(promises);
          }}
        />
      ) : (
        <ActualsComparisonView
          shifts={shifts}
          employees={employees}
          holidays={holidays || []}
          weekDates={weekDates}
          onEditShift={(shift) => openEditShift(shift, true)}
          onAddShift={(employeeId, date) => {
            openNewShift(employeeId, date);
            setModalActualsMode(true);
          }}
        />
      )}

      {/* Copy Previous Week Confirmation */}
      <AlertDialog open={copyPrevConfirmOpen} onOpenChange={setCopyPrevConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy Previous Week</AlertDialogTitle>
            <AlertDialogDescription>
              This will copy {shiftsToCopy.length} shift(s) from the previous week to the current week. Existing shifts will not be overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopyPrevWeek} disabled={copyingPrev}>
              {copyingPrev ? "Copying..." : "Copy Shifts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shift Detail Modal */}
      <Dialog open={shiftModalOpen} onOpenChange={setShiftModalOpen}>
        <DialogContent className="w-[95vw] md:w-[520px] max-h-[90vh] overflow-y-auto !max-w-[95vw]">
          <DialogHeader className="sr-only">
            <DialogTitle>{editingShift?.id ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          {editingShift && (
            <div className="space-y-4 pt-1">
              {/* Employee / Venue / Date — compact info strip */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 border border-border/40 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Employee</p>
                  {editingShift.id || modalActualsMode || editingShift.employee_id ? (
                    <p className="text-sm font-semibold text-foreground truncate">
                      {(() => { const emp = employees.find(e => e.id === editingShift.employee_id); return emp ? `${emp.first_name} ${emp.last_name}` : "—"; })()}
                    </p>
                  ) : (
                    <Select value={editingShift.employee_id || ""} onValueChange={v => {
                      updateField("employee_id", v);
                      const emp = employees.find(e => e.id === v);
                      setShiftVenue(emp?.venue || "");
                    }}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                <div className="h-8 w-px bg-border/50" />
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Venue</p>
                  <p className="text-sm font-medium text-foreground">{shiftVenue || "—"}</p>
                </div>
                <div className="h-8 w-px bg-border/50" />
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Date</p>
                  <p className="text-sm font-medium text-foreground">
                    {editingShift.shift_date ? new Date(editingShift.shift_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"}
                  </p>
                </div>
              </div>

              {modalActualsMode && (
                <p className="text-[10px] text-muted-foreground bg-primary/5 border border-primary/10 rounded-md px-2.5 py-1.5 text-center">
                  {editingShift.id ? "Schedule is read-only — edit actuals below" : "Unscheduled — record actuals below"}
                </p>
              )}

              {/* Plan section - hidden in actuals mode */}
              {!modalActualsMode && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Shift Type</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SHIFT_TYPES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => updateField("shift_type", t.value)}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            (editingShift.shift_type || "regular") === t.value ? t.color + " font-semibold" : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(editingShift.shift_type === "regular" || !editingShift.shift_type) && (
                    <div>
                      <Separator />
                      <TimeGridPicker
                        startTime={editingShift.start_time || "09:00"}
                        endTime={editingShift.end_time || "17:00"}
                        onChangeStart={v => updateField("start_time", v)}
                        onChangeEnd={v => updateField("end_time", v)}
                      />
                      {editingShift.start_time && editingShift.end_time && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Scheduled: <strong>{calcHours(editingShift.start_time, editingShift.end_time, editingShift.break_minutes || 0).toFixed(1)}h</strong>
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* Scheduled summary in actuals mode */}
              {modalActualsMode && editingShift.start_time && editingShift.end_time && (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Planned: <strong className="text-foreground">{formatTime12WithPlus1(editingShift.start_time)} – {formatTime12WithPlus1(editingShift.end_time, editingShift.start_time)}</strong></span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{calcHours(editingShift.start_time, editingShift.end_time, editingShift.break_minutes || 0).toFixed(1)}h</span>
                </div>
              )}

              {/* --- Actuals (Post-Shift) Section --- */}
              {(editingShift.id || modalActualsMode) && (modalActualsMode || viewMode === "actuals") && (
                <>
                  <Separator />
                  <div className={`space-y-3 ${modalActualsMode ? "ring-2 ring-primary/20 rounded-lg p-3 bg-primary/5" : ""}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Post-Shift Actuals {modalActualsMode && <Badge variant="outline" className="ml-2 text-[9px]">Editing</Badge>}
                    </p>

                    {/* Top row: Completed / Not Completed */}
                    <div className="flex flex-wrap gap-1.5">
                      {SHIFT_STATUSES.filter(s => s.group === "top").map(s => {
                        const isActive = (editingShift.status || "scheduled") === s.value;
                        return (
                          <button key={s.value} type="button" onClick={() => {
                            updateField("status", s.value);
                            if (s.value === "completed") {
                              updateField("no_show", false);
                              // Clear actuals override — "same as plan"
                              updateField("actual_shift_type", null);
                              // Set actual times to plan times for hours tracking
                              updateField("actual_start_time", editingShift.start_time || null);
                              updateField("actual_end_time", editingShift.end_time || null);
                            } else {
                              updateField("no_show", false);
                              updateField("actual_shift_type", editingShift.shift_type || "regular");
                              updateField("actual_start_time", null);
                              updateField("actual_end_time", null);
                            }
                          }} className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all ${isActive ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-foreground/30"}`}>{s.label}</button>
                        );
                      })}
                    </div>

                    {/* If Completed as Planned — show locked summary */}
                    {editingShift.status === "completed" && (
                      <p className="text-xs text-muted-foreground italic">Actuals set to planned times. No further edits needed.</p>
                    )}

                    {/* If Not Completed as Planned — show what happened + time fields */}
                    {editingShift.status === "no_show" && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground block">What happened?</label>
                          <div className="flex flex-wrap gap-1.5">
                            {SHIFT_STATUSES.filter(s => s.group === "bottom").map(s => {
                              const ast = editingShift.actual_shift_type || "regular";
                              const isActive = (ast === "regular" && s.value === "scheduled") ||
                                (s.value === "off" && ast === "off") ||
                                (s.value === "al" && ast === "al") ||
                                (s.value === "sh" && ast === "sh") ||
                                (s.value === "no_pay" && ast === "no_pay") ||
                                (s.value === "sick_leave" && ast === "sick_no_pay");
                              return (
                                <button key={s.value} type="button" onClick={() => {
                                  if (s.value === "off") updateField("actual_shift_type", "off");
                                  else if (s.value === "al") updateField("actual_shift_type", "al");
                                  else if (s.value === "sh") updateField("actual_shift_type", "sh");
                                  else if (s.value === "no_pay") updateField("actual_shift_type", "no_pay");
                                  else if (s.value === "sick_leave") updateField("actual_shift_type", "sick_no_pay");
                                  else updateField("actual_shift_type", "regular");
                                }} className={`px-3 py-1 rounded-full border text-[11px] font-medium transition-all ${isActive ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-foreground/30"}`}>{s.label}</button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Show actual time fields only for Work type */}
                        {(editingShift.actual_shift_type === "regular" || !editingShift.actual_shift_type) && (
                          <>
                            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Actual Start</label>
                                <Select value={editingShift.actual_start_time || ""} onValueChange={v => updateField("actual_start_time", v || null)}>
                                  <SelectTrigger><SelectValue placeholder="Start" /></SelectTrigger>
                                  <SelectContent>
                                    {ACTUAL_TIME_OPTIONS.map(t => (
                                      <SelectItem key={`s-${t.value}`} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <span className="text-sm text-muted-foreground pb-2">–</span>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Actual End</label>
                                <Select value={editingShift.actual_end_time || ""} onValueChange={v => updateField("actual_end_time", v || null)}>
                                  <SelectTrigger><SelectValue placeholder="End" /></SelectTrigger>
                                  <SelectContent>
                                    {ACTUAL_TIME_OPTIONS.map(t => (
                                      <SelectItem key={`e-${t.value}`} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {editingShift.actual_start_time && editingShift.actual_end_time && (
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Actual: <strong className="text-foreground">{formatTime12WithPlus1(editingShift.actual_start_time)} – {formatTime12WithPlus1(editingShift.actual_end_time, editingShift.actual_start_time)}</strong> ({calcHours(editingShift.actual_start_time, editingShift.actual_end_time, 0).toFixed(1)}h)</span>
                                {editingShift.start_time && editingShift.end_time && (() => {
                                  const scheduled = calcHours(editingShift.start_time, editingShift.end_time, 0);
                                  const actual = calcHours(editingShift.actual_start_time!, editingShift.actual_end_time!, 0);
                                  const diff = actual - scheduled;
                                  return (
                                    <span>Variance: <strong className={diff < 0 ? "text-destructive" : "text-primary"}>{diff > 0 ? "+" : ""}{(diff * 60).toFixed(0)} min</strong></span>
                                  );
                                })()}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes / Comments</label>
                      <textarea
                        value={editingShift.notes || ""}
                        onChange={e => updateField("notes", e.target.value || null)}
                        placeholder="e.g. Called in sick at 3PM, Left early due to emergency..."
                        rows={2}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </div>
                </>
              )}

              <Button onClick={handleSaveShift} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Shift"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
