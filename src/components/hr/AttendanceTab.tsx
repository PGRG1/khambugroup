import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Plus, Clock, Users, CalendarDays, AlertTriangle, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRShift, HRAttendance, HREmployee } from "@/hooks/useHRData";

interface Props {
  shifts: HRShift[];
  attendance: HRAttendance[];
  employees: HREmployee[];
  onSaveShift: (s: Partial<HRShift>) => Promise<boolean>;
  onSaveAttendance: (a: Partial<HRAttendance>) => Promise<boolean>;
}

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

function ScheduleKPICards({ shifts, weekDates }: { shifts: HRShift[]; weekDates: Date[] }) {
  const stats = useMemo(() => {
    const weekKeys = new Set(weekDates.map(formatDate));
    const weekShifts = shifts.filter(s => weekKeys.has(s.shift_date));
    const scheduledHrs = weekShifts.filter(s => s.shift_type === "regular" || !s.shift_type).reduce((t, s) => t + calcHours(s.start_time, s.end_time, s.break_minutes || 0), 0);
    const actualHrs = weekShifts.reduce((t, s) => t + (Number(s.actual_hours_worked) || 0), 0);
    const noShows = weekShifts.filter(s => s.no_show).length;
    const leaveCounts: Record<string, number> = {};
    weekShifts.filter(s => ["al", "sh", "ph", "sick_no_pay", "no_pay"].includes(s.shift_type || "")).forEach(s => {
      leaveCounts[s.shift_type!] = (leaveCounts[s.shift_type!] || 0) + 1;
    });
    const totalLeave = Object.values(leaveCounts).reduce((a, b) => a + b, 0);
    return { scheduledHrs, actualHrs, noShows, totalLeave, leaveCounts };
  }, [shifts, weekDates]);

  const cards = [
    { label: "Scheduled Hours", value: `${stats.scheduledHrs.toFixed(1)}h`, icon: Clock, color: "text-primary" },
    { label: "Actual Hours", value: `${stats.actualHrs.toFixed(1)}h`, icon: Clock, color: "text-chart-3" },
    { label: "No Shows", value: String(stats.noShows), icon: AlertTriangle, color: "text-destructive" },
    { label: "Leave Days", value: String(stats.totalLeave), icon: CalendarDays, color: "text-chart-2" },
    { label: "Variance", value: `${(stats.actualHrs - stats.scheduledHrs).toFixed(1)}h`, icon: TrendingDown, color: stats.actualHrs < stats.scheduledHrs ? "text-destructive" : "text-primary" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
  );
}

export function AttendanceTab({ shifts, attendance, employees, onSaveShift, onSaveAttendance }: Props) {
  const [weekBase, setWeekBase] = useState(new Date());
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Partial<HRShift> | null>(null);
  const [saving, setSaving] = useState(false);

  const activeEmployees = useMemo(() => employees.filter(e => ["active", "on_leave"].includes(e.status)), [employees]);
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

  const openNewShift = (employeeId: string, date: string) => {
    setEditingShift({
      employee_id: employeeId,
      shift_date: date,
      start_time: "09:00",
      end_time: "17:00",
      break_minutes: 30,
      status: "scheduled",
      shift_type: "regular",
      no_show: false,
    });
    setShiftModalOpen(true);
  };

  const openEditShift = (shift: HRShift) => {
    setEditingShift({ ...shift });
    setShiftModalOpen(true);
  };

  const handleSaveShift = async () => {
    if (!editingShift?.employee_id || !editingShift?.shift_date) return;
    setSaving(true);
    // Auto-calc actual hours if actual times provided
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

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <ScheduleKPICards shifts={shifts} weekDates={weekDates} />

      {/* Week Navigation */}
      <div className="flex items-center justify-between gap-3">
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

      {/* Schedule Grid */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-2 pl-3 font-medium text-muted-foreground min-w-[140px] sticky left-0 bg-muted/50 z-10">Employee</th>
              <th className="text-left p-2 font-medium text-muted-foreground min-w-[60px]">Position</th>
              {weekDates.map((d, i) => {
                const isToday = formatDate(d) === formatDate(new Date());
                return (
                  <th key={i} className={`text-center p-2 font-medium min-w-[100px] ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    <div className="text-xs">{DAY_NAMES[i]}</div>
                    <div className="text-[11px]">{d.getDate()}/{d.getMonth() + 1}</div>
                  </th>
                );
              })}
              <th className="text-center p-2 font-medium text-muted-foreground min-w-[60px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {activeEmployees.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8">No active employees</td></tr>
            ) : activeEmployees.map(emp => {
              let weekTotal = 0;
              return (
                <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-2 pl-3 font-medium sticky left-0 bg-background z-10">
                    <div className="truncate max-w-[130px]">{emp.first_name} {emp.last_name}</div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground truncate max-w-[80px]">{emp.job_title || "—"}</td>
                  {weekDates.map((d, i) => {
                    const dateStr = formatDate(d);
                    const cellShifts = shiftMap[`${emp.id}_${dateStr}`] || [];
                    const isToday = dateStr === formatDate(new Date());
                    cellShifts.forEach(s => {
                      if (s.shift_type === "regular" || !s.shift_type) {
                        weekTotal += calcHours(s.start_time, s.end_time, s.break_minutes || 0);
                      }
                    });
                    return (
                      <td key={i} className={`p-1 align-top ${isToday ? "bg-primary/5" : ""}`}>
                        {cellShifts.length > 0 ? (
                          <div className="space-y-0.5">
                            {cellShifts.map(s => (
                              <button
                                key={s.id}
                                onClick={() => openEditShift(s)}
                                className={`w-full text-[10px] leading-tight rounded px-1 py-0.5 border cursor-pointer text-left transition-colors hover:opacity-80 ${getShiftTypeStyle(s.shift_type || "regular")} ${s.no_show ? "line-through opacity-60" : ""}`}
                              >
                                {(s.shift_type || "regular") === "regular" ? (
                                  <>{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</>
                                ) : (
                                  <span className="font-semibold">{getShiftTypeLabel(s.shift_type || "regular")}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => openNewShift(emp.id, dateStr)}
                            className="w-full h-6 rounded border border-dashed border-border/50 text-muted-foreground/30 hover:border-primary/50 hover:text-primary/50 transition-colors text-[10px] flex items-center justify-center"
                          >
                            +
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center text-xs font-semibold">{weekTotal.toFixed(1)}h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Shift Detail Modal */}
      <Dialog open={shiftModalOpen} onOpenChange={setShiftModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingShift?.id ? "Edit Shift" : "Add Shift"}</DialogTitle></DialogHeader>
          {editingShift && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                  <Select value={editingShift.employee_id || ""} onValueChange={v => updateField("employee_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
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
