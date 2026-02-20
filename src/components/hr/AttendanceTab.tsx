import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRShift, HRAttendance, HREmployee } from "@/hooks/useHRData";

interface Props {
  shifts: HRShift[];
  attendance: HRAttendance[];
  employees: HREmployee[];
  onSaveShift: (s: Partial<HRShift>) => Promise<boolean>;
  onSaveAttendance: (a: Partial<HRAttendance>) => Promise<boolean>;
}

const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half Day" },
];

const SHIFT_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

export function AttendanceTab({ shifts, attendance, employees, onSaveShift, onSaveAttendance }: Props) {
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [attModalOpen, setAttModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Partial<HRShift> | null>(null);
  const [editingAtt, setEditingAtt] = useState<Partial<HRAttendance> | null>(null);
  const [saving, setSaving] = useState(false);

  const activeEmployees = employees.filter(e => e.status === "active");

  const handleSaveShift = async () => {
    if (!editingShift?.employee_id || !editingShift?.shift_date || !editingShift?.start_time || !editingShift?.end_time) return;
    setSaving(true);
    const ok = await onSaveShift(editingShift);
    if (ok) { toast({ title: "Saved" }); setShiftModalOpen(false); }
    setSaving(false);
  };

  const handleSaveAtt = async () => {
    if (!editingAtt?.employee_id || !editingAtt?.date) return;
    setSaving(true);
    const ok = await onSaveAttendance(editingAtt);
    if (ok) { toast({ title: "Saved" }); setAttModalOpen(false); }
    setSaving(false);
  };

  return (
    <Tabs defaultValue="shifts" className="space-y-4">
      <TabsList>
        <TabsTrigger value="shifts">Shifts</TabsTrigger>
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
      </TabsList>

      <TabsContent value="shifts" className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditingShift({ shift_date: new Date().toISOString().split("T")[0], start_time: "09:00", end_time: "17:00", break_minutes: 30, status: "scheduled" }); setShiftModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Shift
          </Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Break (min)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No shifts</TableCell></TableRow>
              ) : shifts.map(s => (
                <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditingShift({ ...s }); setShiftModalOpen(true); }}>
                  <TableCell className="font-medium">{s.employee?.first_name} {s.employee?.last_name}</TableCell>
                  <TableCell>{s.shift_date}</TableCell>
                  <TableCell>{s.start_time}</TableCell>
                  <TableCell>{s.end_time}</TableCell>
                  <TableCell>{s.break_minutes}</TableCell>
                  <TableCell><Badge variant={s.status === "completed" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"}>{SHIFT_STATUSES.find(st => st.value === s.status)?.label || s.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="attendance" className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditingAtt({ date: new Date().toISOString().split("T")[0], status: "present" }); setAttModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Log Attendance
          </Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>OT</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendance.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No attendance records</TableCell></TableRow>
              ) : attendance.map(a => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditingAtt({ ...a }); setAttModalOpen(true); }}>
                  <TableCell className="font-medium">{a.employee?.first_name} {a.employee?.last_name}</TableCell>
                  <TableCell>{a.date}</TableCell>
                  <TableCell>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                  <TableCell>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                  <TableCell>{a.hours_worked ?? "—"}</TableCell>
                  <TableCell>{a.overtime_hours || "—"}</TableCell>
                  <TableCell><Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{ATTENDANCE_STATUSES.find(s => s.value === a.status)?.label || a.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* Shift Modal */}
      <Dialog open={shiftModalOpen} onOpenChange={setShiftModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingShift?.id ? "Edit Shift" : "Add Shift"}</DialogTitle></DialogHeader>
          {editingShift && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                <Select value={editingShift.employee_id || ""} onValueChange={v => setEditingShift(p => p ? { ...p, employee_id: v } : p)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={editingShift.shift_date || ""} onChange={e => setEditingShift(p => p ? { ...p, shift_date: e.target.value } : p)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Time *</label>
                  <Input type="time" value={editingShift.start_time || ""} onChange={e => setEditingShift(p => p ? { ...p, start_time: e.target.value } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">End Time *</label>
                  <Input type="time" value={editingShift.end_time || ""} onChange={e => setEditingShift(p => p ? { ...p, end_time: e.target.value } : p)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Break (min)</label>
                  <Input type="number" value={editingShift.break_minutes || 0} onChange={e => setEditingShift(p => p ? { ...p, break_minutes: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editingShift.status || "scheduled"} onValueChange={v => setEditingShift(p => p ? { ...p, status: v } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SHIFT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input value={editingShift.notes || ""} onChange={e => setEditingShift(p => p ? { ...p, notes: e.target.value } : p)} />
              </div>
              <Button onClick={handleSaveShift} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attendance Modal */}
      <Dialog open={attModalOpen} onOpenChange={setAttModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingAtt?.id ? "Edit Attendance" : "Log Attendance"}</DialogTitle></DialogHeader>
          {editingAtt && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                <Select value={editingAtt.employee_id || ""} onValueChange={v => setEditingAtt(p => p ? { ...p, employee_id: v } : p)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={editingAtt.date || ""} onChange={e => setEditingAtt(p => p ? { ...p, date: e.target.value } : p)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Clock In</label>
                  <Input type="time" value={editingAtt.clock_in ? new Date(editingAtt.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : ""} onChange={e => setEditingAtt(p => p ? { ...p, clock_in: p.date ? `${p.date}T${e.target.value}:00Z` : e.target.value } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Clock Out</label>
                  <Input type="time" value={editingAtt.clock_out ? new Date(editingAtt.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : ""} onChange={e => setEditingAtt(p => p ? { ...p, clock_out: p.date ? `${p.date}T${e.target.value}:00Z` : e.target.value } : p)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Hours</label>
                  <Input type="number" step="0.5" value={editingAtt.hours_worked ?? ""} onChange={e => setEditingAtt(p => p ? { ...p, hours_worked: e.target.value ? Number(e.target.value) : null } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">OT Hours</label>
                  <Input type="number" step="0.5" value={editingAtt.overtime_hours ?? ""} onChange={e => setEditingAtt(p => p ? { ...p, overtime_hours: e.target.value ? Number(e.target.value) : null } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editingAtt.status || "present"} onValueChange={v => setEditingAtt(p => p ? { ...p, status: v } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ATTENDANCE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input value={editingAtt.notes || ""} onChange={e => setEditingAtt(p => p ? { ...p, notes: e.target.value } : p)} />
              </div>
              <Button onClick={handleSaveAtt} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
