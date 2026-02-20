import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HREmployee, HRDepartment } from "@/hooks/useHRData";

interface Props {
  employees: HREmployee[];
  departments: HRDepartment[];
  onSave: (emp: Partial<HREmployee>) => Promise<boolean>;
  onSaveDepartment: (dept: Partial<HRDepartment>) => Promise<boolean>;
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "casual", label: "Casual" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
];

export function EmployeeDirectoryTab({ employees, departments, onSave, onSaveDepartment }: Props) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Partial<HREmployee> | null>(null);
  const [editingDept, setEditingDept] = useState<Partial<HRDepartment> | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = employees.filter(e =>
    `${e.first_name} ${e.last_name} ${e.email || ""} ${e.job_title || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingEmployee({ first_name: "", last_name: "", employment_type: "full_time", status: "active", hire_date: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  };

  const openEdit = (emp: HREmployee) => {
    setEditingEmployee({ ...emp });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingEmployee?.first_name || !editingEmployee?.last_name) return;
    setSaving(true);
    const ok = await onSave(editingEmployee);
    if (ok) { toast({ title: "Saved" }); setModalOpen(false); }
    setSaving(false);
  };

  const handleSaveDept = async () => {
    if (!editingDept?.name) return;
    setSaving(true);
    const ok = await onSaveDepartment(editingDept);
    if (ok) { toast({ title: "Saved" }); setDeptModalOpen(false); }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => setEditingEmployee(prev => prev ? { ...prev, [field]: value } : prev);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditingDept({ name: "", is_active: true }); setDeptModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Department
          </Button>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Employee</Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Hire Date</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No employees found</TableCell></TableRow>
            ) : filtered.map(emp => (
              <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(emp)}>
                <TableCell className="font-medium">{emp.first_name} {emp.last_name}</TableCell>
                <TableCell>{emp.job_title || "—"}</TableCell>
                <TableCell>{emp.department?.name || "—"}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{EMPLOYMENT_TYPES.find(t => t.value === emp.employment_type)?.label || emp.employment_type}</Badge></TableCell>
                <TableCell>
                  <Badge variant={emp.status === "active" ? "default" : emp.status === "on_leave" ? "secondary" : "destructive"} className="text-xs">
                    {STATUS_OPTIONS.find(s => s.value === emp.status)?.label || emp.status}
                  </Badge>
                </TableCell>
                <TableCell>{emp.hire_date}</TableCell>
                <TableCell><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Employee Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingEmployee?.id ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          {editingEmployee && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">First Name *</label>
                  <Input value={editingEmployee.first_name || ""} onChange={e => updateField("first_name", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name *</label>
                  <Input value={editingEmployee.last_name || ""} onChange={e => updateField("last_name", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                  <Input type="email" value={editingEmployee.email || ""} onChange={e => updateField("email", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                  <Input value={editingEmployee.phone || ""} onChange={e => updateField("phone", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Job Title</label>
                  <Input value={editingEmployee.job_title || ""} onChange={e => updateField("job_title", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Department</label>
                  <Select value={editingEmployee.department_id || ""} onValueChange={v => updateField("department_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {departments.filter(d => d.is_active).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Employment Type</label>
                  <Select value={editingEmployee.employment_type || "full_time"} onValueChange={v => updateField("employment_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editingEmployee.status || "active"} onValueChange={v => updateField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Hire Date *</label>
                  <Input type="date" value={editingEmployee.hire_date || ""} onChange={e => updateField("hire_date", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
                  <Input type="date" value={editingEmployee.end_date || ""} onChange={e => updateField("end_date", e.target.value || null)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date of Birth</label>
                  <Input type="date" value={editingEmployee.date_of_birth || ""} onChange={e => updateField("date_of_birth", e.target.value || null)} />
                </div>
              </div>
              <div className="border-t border-border pt-4 mt-4">
                <h4 className="text-sm font-semibold mb-3">Emergency Contact</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Name</label>
                    <Input value={editingEmployee.emergency_contact_name || ""} onChange={e => updateField("emergency_contact_name", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Phone</label>
                    <Input value={editingEmployee.emergency_contact_phone || ""} onChange={e => updateField("emergency_contact_phone", e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input value={editingEmployee.notes || ""} onChange={e => updateField("notes", e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Employee"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Department Modal */}
      <Dialog open={deptModalOpen} onOpenChange={setDeptModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingDept?.id ? "Edit Department" : "Add Department"}</DialogTitle></DialogHeader>
          {editingDept && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                <Input value={editingDept.name || ""} onChange={e => setEditingDept(prev => prev ? { ...prev, name: e.target.value } : prev)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <Input value={editingDept.description || ""} onChange={e => setEditingDept(prev => prev ? { ...prev, description: e.target.value } : prev)} />
              </div>
              <Button onClick={handleSaveDept} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Department"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
