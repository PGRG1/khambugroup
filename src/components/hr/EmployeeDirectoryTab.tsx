import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Plus, Search, Pencil, Users, UserPlus, UserMinus, TrendingUp, Building2, Calendar, Settings2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { HREmployee, HRDepartment } from "@/hooks/useHRData";

interface HREmployeeHistory {
  id: string;
  employee_id: string;
  effective_date: string;
  change_type: string;
  old_value: string | null;
  new_value: string | null;
  field_changed: string | null;
  notes: string | null;
  created_at: string;
}

interface HRHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  holiday_type: string;
  is_active: boolean;
}

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

const VENUE_OPTIONS = [
  { value: "Caliente", label: "Caliente" },
  { value: "Assembly", label: "Assembly" },
  { value: "Caliente / Assembly", label: "Caliente / Assembly" },
  { value: "Kitchen", label: "Kitchen" },
  { value: "Support", label: "Support" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
  { value: "inactive", label: "Inactive" },
];

const CHANGE_TYPES = [
  { value: "promotion", label: "Promotion" },
  { value: "salary_change", label: "Salary Change" },
  { value: "position_change", label: "Position Change" },
  { value: "contract_change", label: "Contract Change" },
  { value: "status_change", label: "Status Change" },
  { value: "other", label: "Other" },
];

function EmployeeKPICards({ employees, history }: { employees: HREmployee[]; history: HREmployeeHistory[] }) {
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter(e => e.status === "active").length;
    const ft = employees.filter(e => e.employment_type === "full_time" && e.status === "active").length;
    const pt = employees.filter(e => e.employment_type === "part_time" && e.status === "active").length;
    const casual = employees.filter(e => e.employment_type === "casual" && e.status === "active").length;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const joiners = employees.filter(e => e.hire_date?.startsWith(thisMonth)).length;
    const leavers = employees.filter(e => e.end_date?.startsWith(thisMonth)).length;
    const activeTenures = employees.filter(e => e.status === "active").map(e => {
      const hire = new Date(e.hire_date);
      return (now.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24 * 30);
    });
    const avgTenure = activeTenures.length ? activeTenures.reduce((a, b) => a + b, 0) / activeTenures.length : 0;
    const turnoverRate = total > 0 ? (leavers / total * 100) : 0;
    const promotions = history.filter(h => h.change_type === "promotion" && h.effective_date?.startsWith(thisMonth)).length;

    const byDept: Record<string, number> = {};
    employees.filter(e => e.status === "active").forEach(e => {
      const dept = e.department?.name || "Unassigned";
      byDept[dept] = (byDept[dept] || 0) + 1;
    });

    return { total, active, ft, pt, casual, joiners, leavers, avgTenure, turnoverRate, promotions, byDept };
  }, [employees, history]);

  const cards = [
    { label: "Total Headcount", value: String(stats.total), icon: Users, color: "text-primary" },
    { label: "Active", value: String(stats.active), icon: Users, color: "text-chart-3" },
    { label: "FT / PT / Casual", value: `${stats.ft} / ${stats.pt} / ${stats.casual}`, icon: Building2, color: "text-chart-2" },
    { label: "Joiners (Month)", value: String(stats.joiners), icon: UserPlus, color: "text-primary" },
    { label: "Leavers (Month)", value: String(stats.leavers), icon: UserMinus, color: "text-destructive" },
    { label: "Turnover", value: `${stats.turnoverRate.toFixed(1)}%`, icon: TrendingUp, color: "text-chart-4" },
    { label: "Promotions", value: String(stats.promotions), icon: TrendingUp, color: "text-chart-3" },
    { label: "Avg Tenure", value: `${stats.avgTenure.toFixed(0)} mo`, icon: Calendar, color: "text-chart-5" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map(c => (
          <div key={c.label} className="card-glass rounded-xl p-3 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-1">
              <c.icon className={`h-3.5 w-3.5 shrink-0 ${c.color}`} />
              <span className="text-[11px] text-muted-foreground leading-tight">{c.label}</span>
            </div>
            <p className="text-sm font-display font-bold text-foreground tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
      {Object.keys(stats.byDept).length > 1 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">By Dept:</span>
          {Object.entries(stats.byDept).map(([dept, count]) => (
            <div key={dept} className="card-glass rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{dept}</span>
              <span className="text-xs font-bold tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployeeDirectoryTab({ employees, departments, onSave, onSaveDepartment }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Partial<HREmployee> | null>(null);
  const [editingDept, setEditingDept] = useState<Partial<HRDepartment> | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Partial<HRHoliday> | null>(null);
  const [saving, setSaving] = useState(false);
  const [holidays, setHolidays] = useState<HRHoliday[]>([]);
  const [holidaysLoaded, setHolidaysLoaded] = useState(false);
  const [history, setHistory] = useState<HREmployeeHistory[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState<Partial<HREmployeeHistory> | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const loadHolidays = async () => {
    const { data } = await supabase.from("hr_holidays" as any).select("*").order("date");
    if (data) { setHolidays(data as any); setHolidaysLoaded(true); }
  };

  const loadHistory = async (empId: string) => {
    const { data } = await supabase.from("hr_employee_history" as any).select("*").eq("employee_id", empId).order("effective_date", { ascending: false });
    if (data) setHistory(data as any);
  };

  if (!holidaysLoaded) loadHolidays();

  const filtered = useMemo(() => {
    return employees.filter(e => {
      const matchesSearch = `${e.first_name} ${e.last_name} ${e.email || ""} ${e.job_title || ""}`.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      const matchesVenue = venueFilter === "all" || e.venue === venueFilter;
      return matchesSearch && matchesStatus && matchesVenue;
    });
  }, [employees, search, statusFilter, venueFilter]);

  const openEdit = (emp: HREmployee) => {
    setEditingEmployee({ ...emp });
    setSelectedEmployeeId(emp.id);
    loadHistory(emp.id);
    setModalOpen(true);
  };

  const openNew = () => {
    setEditingEmployee({ first_name: "", last_name: "", employment_type: "full_time", status: "active", hire_date: new Date().toISOString().split("T")[0] });
    setSelectedEmployeeId(null);
    setHistory([]);
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

  const handleSaveHoliday = async () => {
    if (!editingHoliday?.name || !editingHoliday?.date) return;
    setSaving(true);
    const payload: any = { ...editingHoliday, year: new Date(editingHoliday.date).getFullYear() };
    const { error } = editingHoliday.id
      ? await supabase.from("hr_holidays" as any).update(payload).eq("id", editingHoliday.id)
      : await supabase.from("hr_holidays" as any).insert(payload);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Holiday saved" }); setHolidayModalOpen(false); await loadHolidays(); }
    setSaving(false);
  };

  const handleSaveHistory = async () => {
    if (!editingHistory?.change_type || !selectedEmployeeId) return;
    setSaving(true);
    const payload: any = { ...editingHistory, employee_id: selectedEmployeeId };
    const { error } = editingHistory.id
      ? await supabase.from("hr_employee_history" as any).update(payload).eq("id", editingHistory.id)
      : await supabase.from("hr_employee_history" as any).insert(payload);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Record saved" }); setHistoryModalOpen(false); await loadHistory(selectedEmployeeId); }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => setEditingEmployee(prev => prev ? { ...prev, [field]: value } : prev);

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "on_leave": return "secondary";
      default: return "destructive";
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions row (the parent shell now owns the page title) */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4 mr-1.5" /> Manage
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Reference data</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => { setEditingDept({ name: "", is_active: true }); setDeptModalOpen(true); }}
            >
              <Building2 className="h-4 w-4 mr-2" /> Add department
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => { setEditingHoliday({ name: "", date: "", holiday_type: "statutory", is_active: true }); setHolidayModalOpen(true); }}
            >
              <Calendar className="h-4 w-4 mr-2" /> Add public holiday
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Bulk</DropdownMenuLabel>
            <DropdownMenuItem disabled className="opacity-60">
              <UserPlus className="h-4 w-4 mr-2" /> Import employees (soon)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Employee
        </Button>
      </div>


      {/* KPI Cards */}
      <EmployeeKPICards employees={employees} history={history} />

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Venue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Venues</SelectItem>
            {VENUE_OPTIONS.map(v => (
              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Job Title</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Venue</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Department</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Hire Date</th>
                <th className="w-10 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-12">
                    No employees found
                  </td>
                </tr>
              ) : filtered.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className={`cursor-pointer transition-colors hover:bg-accent/10 ${idx !== filtered.length - 1 ? "border-b border-border/50" : ""}`}
                  onClick={() => navigate(`/hr/employees/${emp.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{emp.first_name} {emp.last_name}</div>
                    <div className="text-[11px] text-muted-foreground sm:hidden">{emp.job_title || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{emp.job_title || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{emp.venue || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{emp.department?.name || "—"}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {EMPLOYMENT_TYPES.find(t => t.value === emp.employment_type)?.label || emp.employment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(emp.status)} className="text-[10px] font-medium">
                      {STATUS_OPTIONS.find(s => s.value === emp.status)?.label || emp.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs hidden lg:table-cell">{emp.hire_date}</td>
                  <td className="px-2 py-3">
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
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
            Showing {filtered.length} of {employees.length} employees
          </div>
        )}
      </div>

      {/* Employee Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingEmployee?.id ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          {editingEmployee && (
            <Tabs defaultValue="details" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                {editingEmployee.id && <TabsTrigger value="history" className="flex-1">History</TabsTrigger>}
              </TabsList>

              <TabsContent value="details" className="space-y-4 pt-3">
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
                    <Select value={editingEmployee.venue || ""} onValueChange={v => updateField("venue", v)}>
                      <SelectTrigger><SelectValue placeholder="Select venue..." /></SelectTrigger>
                      <SelectContent>{VENUE_OPTIONS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
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
                    <Select value={editingEmployee.status || "active"} onValueChange={v => updateField("status", v)}>
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
              </TabsContent>

              {editingEmployee.id && (
                <TabsContent value="history" className="space-y-3 pt-3">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => { setEditingHistory({ change_type: "other", effective_date: new Date().toISOString().split("T")[0] }); setHistoryModalOpen(true); }}>
                      <Plus className="h-4 w-4 mr-1" /> Add Record
                    </Button>
                  </div>
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No history records</p>
                  ) : (
                    <div className="space-y-2">
                      {history.map(h => (
                        <button
                          key={h.id}
                          onClick={() => { setEditingHistory({ ...h }); setHistoryModalOpen(true); }}
                          className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="secondary" className="text-[10px]">{CHANGE_TYPES.find(t => t.value === h.change_type)?.label || h.change_type}</Badge>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{h.effective_date}</span>
                          </div>
                          {h.field_changed && (
                            <p className="text-xs text-muted-foreground">
                              {h.field_changed}: <span className="line-through">{h.old_value}</span> → <span className="font-medium text-foreground">{h.new_value}</span>
                            </p>
                          )}
                          {h.notes && <p className="text-xs text-muted-foreground mt-1">{h.notes}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              )}
            </Tabs>
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

      {/* Holiday Modal */}
      <Dialog open={holidayModalOpen} onOpenChange={setHolidayModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingHoliday?.id ? "Edit Holiday" : "Add Holiday"}</DialogTitle></DialogHeader>
          {editingHoliday && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                <Input value={editingHoliday.name || ""} onChange={e => setEditingHoliday(p => p ? { ...p, name: e.target.value } : p)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={editingHoliday.date || ""} onChange={e => setEditingHoliday(p => p ? { ...p, date: e.target.value } : p)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                <Select value={editingHoliday.holiday_type || "statutory"} onValueChange={v => setEditingHoliday(p => p ? { ...p, holiday_type: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="statutory">Statutory Holiday</SelectItem>
                    <SelectItem value="public">Public Holiday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveHoliday} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Holiday"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Record Modal */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingHistory?.id ? "Edit Record" : "Add History Record"}</DialogTitle></DialogHeader>
          {editingHistory && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Change Type *</label>
                <Select value={editingHistory.change_type || "other"} onValueChange={v => setEditingHistory(p => p ? { ...p, change_type: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CHANGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Effective Date *</label>
                <Input type="date" value={editingHistory.effective_date || ""} onChange={e => setEditingHistory(p => p ? { ...p, effective_date: e.target.value } : p)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Field Changed</label>
                <Input value={editingHistory.field_changed || ""} onChange={e => setEditingHistory(p => p ? { ...p, field_changed: e.target.value } : p)} placeholder="e.g. job_title, salary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Old Value</label>
                  <Input value={editingHistory.old_value || ""} onChange={e => setEditingHistory(p => p ? { ...p, old_value: e.target.value } : p)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">New Value</label>
                  <Input value={editingHistory.new_value || ""} onChange={e => setEditingHistory(p => p ? { ...p, new_value: e.target.value } : p)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input value={editingHistory.notes || ""} onChange={e => setEditingHistory(p => p ? { ...p, notes: e.target.value } : p)} />
              </div>
              <Button onClick={handleSaveHistory} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Record"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
