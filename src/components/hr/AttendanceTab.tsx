import { useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Plus, Clock, Users, CalendarDays, AlertTriangle, TrendingDown, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { HRShift, HRAttendance, HREmployee } from "@/hooks/useHRData";
import { WeeklyScheduleView } from "./WeeklyScheduleView";

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
  { value: "regular", label: "Work", color: "bg-primary/20 text-primary border-primary/30" },
  { value: "al", label: "AL", color: "bg-chart-3/20 text-chart-3 border-chart-3/30" },
  { value: "sh", label: "SH", color: "bg-chart-2/20 text-chart-2 border-chart-2/30" },
  { value: "ph", label: "PH", color: "bg-chart-4/20 text-chart-4 border-chart-4/30" },
  { value: "sick_no_pay", label: "Sick (NP)", color: "bg-destructive/20 text-destructive border-destructive/30" },
  { value: "no_pay", label: "No Pay", color: "bg-destructive/15 text-destructive border-destructive/20" },
  { value: "off", label: "OFF", color: "bg-muted text-muted-foreground border-border" },
  { value: "rest", label: "Rest", color: "bg-muted text-muted-foreground border-border" },
  { value: "training", label: "Training", color: "bg-chart-5/20 text-chart-5 border-chart-5/30" },
];

const SHIFT_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

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

function calcHours(start: string, end: string, breakMin: number): number {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1) - breakMin;
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

export function AttendanceTab({ shifts, attendance, employees, departments, leaveRequests, leaveTypes, onSaveShift, onSaveAttendance, onSaveLeaveRequest, onRefetch }: Props) {
  const [weekBase, setWeekBase] = useState(new Date());
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Partial<HRShift> | null>(null);
  const [shiftVenue, setShiftVenue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  

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
      break_minutes: 30,
      status: "scheduled",
      shift_type: "regular",
      no_show: false,
    });
    const emp = employees.find(e => e.id === employeeId);
    setShiftVenue(emp?.venue || "");
    setShiftModalOpen(true);
  };

  const openEditShift = (shift: HRShift) => {
    setEditingShift({ ...shift });
    const emp = employees.find(e => e.id === shift.employee_id);
    setShiftVenue(emp?.venue || "");
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
    const payload = { ...editingShift };
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

      {/* Week Navigation + View Toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="outline" size="icon" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm font-medium ml-2">{weekLabel}</span>
        </div>
        <Button size="sm" onClick={() => openNewShift("", formatDate(weekDates[0]))}>
          <Plus className="h-4 w-4 mr-1" /> Add Shift
        </Button>
      </div>

      <WeeklyScheduleView
        shifts={shifts}
        employees={employees}
        departments={departments || []}
        leaveRequests={leaveRequests || []}
        leaveTypes={leaveTypes || []}
        weekDates={weekDates}
        onEditShift={openEditShift}
        onAddShift={openNewShift}
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

      {/* Shift Detail Modal */}
      <Dialog open={shiftModalOpen} onOpenChange={setShiftModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingShift?.id ? "Edit Shift" : "Add Shift"}</DialogTitle></DialogHeader>
          {editingShift && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                  <Select value={editingShift.employee_id || ""} onValueChange={v => {
                    updateField("employee_id", v);
                    const emp = employees.find(e => e.id === v);
                    setShiftVenue(emp?.venue || "");
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Venue</label>
                  <Select value={shiftVenue} onValueChange={setShiftVenue}>
                    <SelectTrigger><SelectValue placeholder="Select venue..." /></SelectTrigger>
                    <SelectContent>{VENUE_OPTIONS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
                  <Input type="date" value={editingShift.shift_date || ""} onChange={e => updateField("shift_date", e.target.value)} />
                </div>
              </div>

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
                <>
                  <Separator />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scheduled Time</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Start *</label>
                      <Input type="time" value={editingShift.start_time || ""} onChange={e => updateField("start_time", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">End *</label>
                      <Input type="time" value={editingShift.end_time || ""} onChange={e => updateField("end_time", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Break (min)</label>
                      <Input type="number" value={editingShift.break_minutes || 0} onChange={e => updateField("break_minutes", Number(e.target.value))} />
                    </div>
                  </div>
                  {editingShift.start_time && editingShift.end_time && (
                    <p className="text-xs text-muted-foreground">
                      Total: <strong>{calcHours(editingShift.start_time, editingShift.end_time, editingShift.break_minutes || 0).toFixed(1)}h</strong>
                    </p>
                  )}

                  <Separator />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actual Time (Post-Schedule)</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Actual Start</label>
                      <Input type="time" value={editingShift.actual_start_time || ""} onChange={e => updateField("actual_start_time", e.target.value || null)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Actual End</label>
                      <Input type="time" value={editingShift.actual_end_time || ""} onChange={e => updateField("actual_end_time", e.target.value || null)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Actual Break (min)</label>
                      <Input type="number" value={editingShift.actual_break_minutes || 0} onChange={e => updateField("actual_break_minutes", Number(e.target.value))} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={editingShift.no_show || false} onChange={e => updateField("no_show", e.target.checked)} className="rounded" />
                      No Show
                    </label>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editingShift.status || "scheduled"} onValueChange={v => updateField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SHIFT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                  <Input value={editingShift.notes || ""} onChange={e => updateField("notes", e.target.value)} />
                </div>
              </div>

              <Button onClick={handleSaveShift} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Shift"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
