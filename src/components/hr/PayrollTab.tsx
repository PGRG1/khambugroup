import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRPayroll, HREmployee } from "@/hooks/useHRData";

interface Props {
  payroll: HRPayroll[];
  employees: HREmployee[];
  onSave: (p: Partial<HRPayroll>) => Promise<boolean>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYMENT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
];

const fmt = (v: number | null | undefined) => v != null ? `$${v.toLocaleString()}` : "—";

export function PayrollTab({ payroll, employees, onSave }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<HRPayroll> | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const activeEmployees = employees.filter(e => e.status === "active");
  const filtered = payroll.filter(p => p.year === filterYear);

  const openNew = () => {
    setEditing({
      year: filterYear,
      month: new Date().getMonth() + 1,
      forecast_base_salary: 0, forecast_allowances: 0, forecast_deductions: 0,
      forecast_overtime: 0, forecast_bonus: 0, forecast_total: 0,
      payment_status: "pending",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editing?.employee_id || !editing?.year || !editing?.month) return;
    setSaving(true);
    // Auto-calculate totals
    const forecastTotal = (editing.forecast_base_salary || 0) + (editing.forecast_allowances || 0) - (editing.forecast_deductions || 0) + (editing.forecast_overtime || 0) + (editing.forecast_bonus || 0);
    const actualTotal = editing.actual_base_salary != null
      ? (editing.actual_base_salary || 0) + (editing.actual_allowances || 0) - (editing.actual_deductions || 0) + (editing.actual_overtime || 0) + (editing.actual_bonus || 0)
      : null;
    const ok = await onSave({ ...editing, forecast_total: forecastTotal, actual_total: actualTotal });
    if (ok) { toast({ title: "Saved" }); setModalOpen(false); }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => setEditing(p => p ? { ...p, [field]: value } : p);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Year:</label>
          <Input type="number" className="w-24" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} />
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Payroll</Button>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Forecast Total</TableHead>
              <TableHead className="text-right">Actual Total</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No payroll records for {filterYear}</TableCell></TableRow>
            ) : filtered.map(p => {
              const variance = p.actual_total != null ? p.actual_total - p.forecast_total : null;
              return (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditing({ ...p }); setModalOpen(true); }}>
                  <TableCell className="font-medium">{p.employee?.first_name} {p.employee?.last_name}</TableCell>
                  <TableCell>{MONTHS[(p.month - 1)] || p.month}</TableCell>
                  <TableCell className="text-right">{fmt(p.forecast_total)}</TableCell>
                  <TableCell className="text-right">{fmt(p.actual_total)}</TableCell>
                  <TableCell className={`text-right ${variance != null ? (variance > 0 ? "text-destructive" : variance < 0 ? "text-primary" : "") : ""}`}>
                    {variance != null ? `${variance > 0 ? "+" : ""}${fmt(variance)}` : "—"}
                  </TableCell>
                  <TableCell><Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "outline"}>{PAYMENT_STATUSES.find(s => s.value === p.payment_status)?.label || p.payment_status}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Payroll Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit Payroll" : "Add Payroll Record"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-6 pt-2">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                  <Select value={editing.employee_id || ""} onValueChange={v => updateField("employee_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Year *</label>
                  <Input type="number" value={editing.year || ""} onChange={e => updateField("year", Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Month *</label>
                  <Select value={String(editing.month || 1)} onValueChange={v => updateField("month", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Forecast Section */}
              <div>
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Forecast</h4>
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Base Salary</label>
                    <Input type="number" value={editing.forecast_base_salary || 0} onChange={e => updateField("forecast_base_salary", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Allowances</label>
                    <Input type="number" value={editing.forecast_allowances || 0} onChange={e => updateField("forecast_allowances", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Deductions</label>
                    <Input type="number" value={editing.forecast_deductions || 0} onChange={e => updateField("forecast_deductions", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Overtime</label>
                    <Input type="number" value={editing.forecast_overtime || 0} onChange={e => updateField("forecast_overtime", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bonus</label>
                    <Input type="number" value={editing.forecast_bonus || 0} onChange={e => updateField("forecast_bonus", Number(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* Actual Section */}
              <div>
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Actual (Month-End)</h4>
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Base Salary</label>
                    <Input type="number" value={editing.actual_base_salary ?? ""} placeholder="—" onChange={e => updateField("actual_base_salary", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Allowances</label>
                    <Input type="number" value={editing.actual_allowances ?? ""} placeholder="—" onChange={e => updateField("actual_allowances", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Deductions</label>
                    <Input type="number" value={editing.actual_deductions ?? ""} placeholder="—" onChange={e => updateField("actual_deductions", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Overtime</label>
                    <Input type="number" value={editing.actual_overtime ?? ""} placeholder="—" onChange={e => updateField("actual_overtime", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bonus</label>
                    <Input type="number" value={editing.actual_bonus ?? ""} placeholder="—" onChange={e => updateField("actual_bonus", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Status</label>
                  <Select value={editing.payment_status || "pending"} onValueChange={v => updateField("payment_status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Date</label>
                  <Input type="date" value={editing.payment_date || ""} onChange={e => updateField("payment_date", e.target.value || null)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input value={editing.notes || ""} onChange={e => updateField("notes", e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
