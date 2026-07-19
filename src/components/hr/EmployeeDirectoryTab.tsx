import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useVenues } from "@/hooks/useVenues";
import type { HREmployee, HRDepartment } from "@/hooks/useHRData";
import { AllocationProfilePicker } from "@/components/allocation/AllocationProfilePicker";

interface Props {
  employees: HREmployee[];
  departments: HRDepartment[];
  onSave: (emp: Partial<HREmployee>) => Promise<boolean>;
  onSaveDepartment: (dept: Partial<HRDepartment>) => Promise<boolean>;
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "casual", label: "Casual" },
];

// Simplified: only two statuses surface in the directory. Legacy values
// (on_leave, resigned, terminated) are treated as Inactive here but preserved
// in the database untouched.
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const isActive = (s: string | null | undefined) => s === "active";
const displayStatus = (s: string | null | undefined) => (isActive(s) ? "Active" : "Inactive");

export function EmployeeDirectoryTab({ employees, departments, onSave }: Props) {
  const navigate = useNavigate();
  const { venues } = useVenues();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Partial<HREmployee & { venue_id: string | null }> | null>(null);
  const [saving, setSaving] = useState(false);

  const venueById = useMemo(() => {
    const m = new Map<string, string>();
    venues.forEach(v => m.set(v.id, v.name));
    return m;
  }, [venues]);

  const venueDisplay = (emp: HREmployee) => {
    const vid = (emp as any).venue_id as string | null | undefined;
    if (vid && venueById.has(vid)) return venueById.get(vid)!;
    return emp.venue || "—";
  };

  const filtered = useMemo(() => {
    return employees.filter(e => {
      const matchesSearch = `${e.first_name} ${e.last_name} ${e.email || ""} ${e.job_title || ""}`.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? isActive(e.status) : !isActive(e.status));
      const vid = (e as any).venue_id as string | null | undefined;
      const empVenueName = vid ? venueById.get(vid) : e.venue;
      const matchesVenue = venueFilter === "all" || empVenueName === venueFilter;
      return matchesSearch && matchesStatus && matchesVenue;
    });
  }, [employees, search, statusFilter, venueFilter, venueById]);

  const activeCount = employees.filter(e => isActive(e.status)).length;

  const openEdit = (emp: HREmployee) => {
    setEditingEmployee({ ...emp });
    setModalOpen(true);
  };

  const openNew = () => {
    setEditingEmployee({ first_name: "", last_name: "", employment_type: "full_time", status: "active", hire_date: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingEmployee?.first_name || !editingEmployee?.last_name) return;
    setSaving(true);
    const ok = await onSave(editingEmployee as Partial<HREmployee>);
    if (ok) { toast({ title: "Saved" }); setModalOpen(false); }
    setSaving(false);
  };

  const updateField = (field: string, value: any) =>
    setEditingEmployee(prev => prev ? { ...prev, [field]: value } : prev);

  return (
    <div className="space-y-4">
      {/* Action row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {employees.length} employees · {activeCount} active
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Employee
        </Button>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Venues</SelectItem>
            {venues.filter(v => v.is_active).map(v => (
              <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || venueFilter !== "all" || search) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter("all"); setVenueFilter("all"); }}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Employee Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Job Title</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Department</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Venue</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="w-10 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-12">No employees found</td>
                </tr>
              ) : filtered.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className={`cursor-pointer transition-colors hover:bg-accent/10 ${idx !== filtered.length - 1 ? "border-b border-border/50" : ""}`}
                  onClick={() => navigate(`/hr/employees/${emp.id}`)}
                >
                  <td className="px-4 py-2 font-medium text-foreground">{emp.first_name} {emp.last_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{emp.job_title || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{emp.department?.name || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{venueDisplay(emp)}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {EMPLOYMENT_TYPES.find(t => t.value === emp.employment_type)?.label || emp.employment_type}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={isActive(emp.status) ? "default" : "secondary"} className="text-[10px] font-medium">
                      {displayStatus(emp.status)}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      title="Edit inline"
                      className="p-1 rounded hover:bg-accent/20"
                      onClick={(e) => { e.stopPropagation(); openEdit(emp); }}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Detail Modal — Details only */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingEmployee?.id ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          {editingEmployee && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Venue</label>
                  <Select
                    value={(editingEmployee as any).venue_id || ""}
                    onValueChange={v => updateField("venue_id", v || null)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select venue..." /></SelectTrigger>
                    <SelectContent>
                      {venues.filter(v => v.is_active).map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Department</label>
                  <Select value={editingEmployee.department_id || ""} onValueChange={v => updateField("department_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{departments.filter(d => d.is_active).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Employment Type</label>
                  <Select value={editingEmployee.employment_type || "full_time"} onValueChange={v => updateField("employment_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EMPLOYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={isActive(editingEmployee.status) ? "active" : "inactive"} onValueChange={v => updateField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
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
              <Separator />
              <div>
                <h4 className="text-sm font-semibold font-display mb-2">Cost allocation</h4>
                <AllocationProfilePicker
                  mode={(editingEmployee as any).cost_allocation_mode}
                  profileId={(editingEmployee as any).cost_allocation_profile_id}
                  onChange={(m, pid) => {
                    updateField("cost_allocation_mode", m);
                    updateField("cost_allocation_profile_id", pid);
                  }}
                />
              </div>
              <Separator />
              <h4 className="text-sm font-semibold font-display">Emergency Contact</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Name</label>
                  <Input value={editingEmployee.emergency_contact_name || ""} onChange={e => updateField("emergency_contact_name", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Phone</label>
                  <Input value={editingEmployee.emergency_contact_phone || ""} onChange={e => updateField("emergency_contact_phone", e.target.value)} />
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
    </div>
  );
}
