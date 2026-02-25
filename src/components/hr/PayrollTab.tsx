import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Plus, DollarSign, Users, TrendingDown, Building2, CalendarDays } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRPayroll, HREmployee, HRShift } from "@/hooks/useHRData";

interface Props {
  payroll: HRPayroll[];
  employees: HREmployee[];
  shifts: HRShift[];
  onSave: (p: Partial<HRPayroll>) => Promise<boolean>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYROLL_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
];
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const fmt = (v: number | null | undefined) => v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
const fmtShort = (v: number) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toLocaleString()}`;

function PayrollKPICards({ payroll, employees }: { payroll: HRPayroll[]; employees: HREmployee[] }) {
  const stats = useMemo(() => {
    const totalGross = payroll.reduce((s, p) => s + Number(p.gross_salary || 0), 0);
    const totalNet = payroll.reduce((s, p) => s + Number(p.net_salary || 0), 0);
    const totalMPFEmployee = payroll.reduce((s, p) => s + Number(p.mpf_employee || 0), 0);
    const totalMPFEmployer = payroll.reduce((s, p) => s + Number(p.mpf_employer || 0), 0);
    const totalDeductions = payroll.reduce((s, p) => s + Number(p.total_deductions || 0), 0);
    const totalOtherPayments = payroll.reduce((s, p) => s + Number(p.other_payments || 0), 0);
    const paidCount = payroll.filter(p => p.payment_status === "paid").length;
    const unpaidCount = payroll.filter(p => p.payment_status !== "paid").length;

    const byType: Record<string, number> = {};
    payroll.forEach(p => {
      const emp = employees.find(e => e.id === p.employee_id);
      const type = emp?.employment_type || "unknown";
      byType[type] = (byType[type] || 0) + Number(p.gross_salary || 0);
    });

    const byDept: Record<string, number> = {};
    payroll.forEach(p => {
      const emp = employees.find(e => e.id === p.employee_id);
      const dept = emp?.department?.name || "Unassigned";
      byDept[dept] = (byDept[dept] || 0) + Number(p.gross_salary || 0);
    });

    const byPosition: Record<string, number> = {};
    payroll.forEach(p => {
      const emp = employees.find(e => e.id === p.employee_id);
      const pos = emp?.job_title || "Unassigned";
      byPosition[pos] = (byPosition[pos] || 0) + Number(p.gross_salary || 0);
    });

    return { totalGross, totalNet, totalMPFEmployee, totalMPFEmployer, totalDeductions, totalOtherPayments, paidCount, unpaidCount, byType, byDept, byPosition };
  }, [payroll, employees]);

  const cards = [
    { label: "Total Payroll Cost", value: fmt(stats.totalGross), icon: DollarSign, color: "text-primary" },
    { label: "Total Net Salary", value: fmt(stats.totalNet), icon: DollarSign, color: "text-chart-3" },
    { label: "Total MPF Paid", value: fmt(stats.totalMPFEmployee + stats.totalMPFEmployer), icon: Building2, color: "text-chart-2" },
    { label: "Employer MPF", value: fmt(stats.totalMPFEmployer), icon: Building2, color: "text-chart-4" },
    { label: "Employee MPF", value: fmt(stats.totalMPFEmployee), icon: Users, color: "text-chart-5" },
    { label: "Total Deductions", value: fmt(stats.totalDeductions), icon: TrendingDown, color: "text-destructive" },
    { label: "Other Payments", value: fmt(stats.totalOtherPayments), icon: DollarSign, color: "text-primary" },
    { label: "Paid / Unpaid", value: `${stats.paidCount} / ${stats.unpaidCount}`, icon: CalendarDays, color: "text-chart-3" },
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
            <p className="text-sm font-display font-bold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-3 flex-wrap">
        {Object.entries(stats.byType).map(([type, amount]) => (
          <div key={type} className="card-glass rounded-lg px-3 py-2 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{type.replace("_", " ").toUpperCase()}</Badge>
            <span className="text-sm font-semibold">{fmt(amount)}</span>
          </div>
        ))}
      </div>
      {Object.keys(stats.byDept).length > 1 && (
        <div className="flex gap-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground self-center">By Dept:</span>
          {Object.entries(stats.byDept).map(([dept, amount]) => (
            <div key={dept} className="card-glass rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{dept}</span>
              <span className="text-xs font-semibold">{fmt(amount)}</span>
            </div>
          ))}
        </div>
      )}
      {Object.keys(stats.byPosition).length > 1 && (
        <div className="flex gap-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground self-center">By Position:</span>
          {Object.entries(stats.byPosition).map(([pos, amount]) => (
            <div key={pos} className="card-glass rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{pos}</span>
              <span className="text-xs font-semibold">{fmt(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MTDScheduleView({ employeeId, shifts, month, year }: { employeeId: string; shifts: HRShift[]; month: number; year: number }) {
  const monthShifts = useMemo(() => {
    return shifts.filter(s => {
      if (s.employee_id !== employeeId) return false;
      const d = new Date(s.shift_date);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    }).sort((a, b) => a.shift_date.localeCompare(b.shift_date));
  }, [shifts, employeeId, month, year]);

  const totalHours = monthShifts.reduce((s, sh) => {
    const [sh1, sm1] = sh.start_time.split(":").map(Number);
    const [sh2, sm2] = sh.end_time.split(":").map(Number);
    let hrs = (sh2 * 60 + sm2 - sh1 * 60 - sm1 - (sh.break_minutes || 0)) / 60;
    if (hrs < 0) hrs += 24;
    return s + hrs;
  }, 0);

  const shiftTypeLabels: Record<string, string> = {
    regular: "Work", al: "AL", sh: "SH", ph: "PH", sick_no_pay: "Sick (NP)", no_pay: "No Pay", off: "OFF", rest: "Rest", training: "Training",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">MTD Schedule — {MONTHS[month - 1]} {year}</h4>
        <Badge variant="secondary">{totalHours.toFixed(1)} hrs total</Badge>
      </div>
      {monthShifts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No shifts scheduled for this month</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Day</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Break</TableHead>
                <TableHead className="text-xs text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthShifts.map(sh => {
                const d = new Date(sh.shift_date);
                const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                const [sh1, sm1] = sh.start_time.split(":").map(Number);
                const [sh2, sm2] = sh.end_time.split(":").map(Number);
                let hrs = (sh2 * 60 + sm2 - sh1 * 60 - sm1 - (sh.break_minutes || 0)) / 60;
                if (hrs < 0) hrs += 24;
                const isLeave = ["al", "sh", "ph", "sick_no_pay", "no_pay", "off", "rest"].includes(sh.shift_type || "regular");
                return (
                  <TableRow key={sh.id} className={isLeave ? "bg-muted/30" : ""}>
                    <TableCell className="text-xs py-1.5">{sh.shift_date}</TableCell>
                    <TableCell className="text-xs py-1.5">{dayName}</TableCell>
                    <TableCell className="text-xs py-1.5">
                      <Badge variant={isLeave ? "outline" : "secondary"} className="text-[10px]">
                        {shiftTypeLabels[sh.shift_type || "regular"] || sh.shift_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1.5">{sh.start_time?.slice(0, 5)}</TableCell>
                    <TableCell className="text-xs py-1.5">{sh.end_time?.slice(0, 5)}</TableCell>
                    <TableCell className="text-xs py-1.5">{sh.break_minutes || 0}m</TableCell>
                    <TableCell className="text-xs py-1.5 text-right font-medium">{hrs.toFixed(1)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function PayrollTab({ payroll, employees, shifts, onSave }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<HRPayroll> | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all

  const activeEmployees = employees.filter(e => ["active", "on_leave"].includes(e.status));
  const filtered = payroll.filter(p => {
    if (p.year !== filterYear) return false;
    if (filterMonth > 0 && p.month !== filterMonth) return false;
    return true;
  });

  const openNew = () => {
    setEditing({
      year: filterYear,
      month: filterMonth > 0 ? filterMonth : new Date().getMonth() + 1,
      forecast_base_salary: 0, forecast_allowances: 0, forecast_deductions: 0,
      forecast_overtime: 0, forecast_bonus: 0, forecast_total: 0,
      annual_leave_pay: 0, statutory_holiday_pay: 0, other_payments: 0,
      mpf_employee: 0, mpf_employer: 0,
      sick_leave_deduction: 0, unpaid_leave_deduction: 0, other_deductions: 0,
      gross_salary: 0, total_deductions: 0, net_salary: 0,
      mpf_payment_amount: 0, payment_method: "bank_transfer",
      payment_status: "draft",
    });
    setModalOpen(true);
  };

  const calcTotals = (p: Partial<HRPayroll>) => {
    const baseSalary = Number(p.forecast_base_salary || 0);
    const alPay = Number(p.annual_leave_pay || 0);
    const shPay = Number(p.statutory_holiday_pay || 0);
    const otherPay = Number(p.other_payments || 0);
    const gross = baseSalary + alPay + shPay + otherPay;

    const sickDed = Number(p.sick_leave_deduction || 0);
    const unpaidDed = Number(p.unpaid_leave_deduction || 0);
    const otherDed = Number(p.other_deductions || 0);
    const mpfEmp = Number(p.mpf_employee || 0);
    const totalDed = sickDed + unpaidDed + otherDed + mpfEmp;

    const net = gross - totalDed;
    const mpfTotal = mpfEmp + Number(p.mpf_employer || 0);

    return { gross_salary: gross, total_deductions: totalDed, net_salary: net, mpf_payment_amount: mpfTotal };
  };

  const handleSave = async () => {
    if (!editing?.employee_id || !editing?.year || !editing?.month) return;
    setSaving(true);
    const totals = calcTotals(editing);
    const ok = await onSave({ ...editing, ...totals });
    if (ok) { toast({ title: "Payroll saved" }); setModalOpen(false); }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => setEditing(p => p ? { ...p, [field]: value } : p);
  const numField = (field: string, value: string) => updateField(field, value === "" ? 0 : Number(value));

  const statusBadge = (status: string) => {
    const variant = status === "paid" ? "default" : status === "approved" ? "secondary" : "outline";
    return <Badge variant={variant}>{PAYROLL_STATUSES.find(s => s.value === status)?.label || status}</Badge>;
  };

  return (
    <div className="space-y-5">
      {/* KPI Analytics */}
      <PayrollKPICards payroll={filtered} employees={employees} />

      {/* Filters */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Year:</label>
          <Input type="number" className="w-24" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} />
          <label className="text-sm font-medium ml-2">Month:</label>
          <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">All</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Payroll</Button>
      </div>

      {/* Payroll Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Base Salary</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">MPF (Emp)</TableHead>
              <TableHead className="text-right">Net Salary</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No payroll records for this period</TableCell></TableRow>
            ) : filtered.map(p => {
              const emp = employees.find(e => e.id === p.employee_id);
              return (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditing({ ...p }); setModalOpen(true); }}>
                  <TableCell className="font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {emp?.employment_type?.replace("_", " ").toUpperCase() || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>{MONTHS[(p.month - 1)] || p.month}</TableCell>
                  <TableCell className="text-right">{fmt(p.forecast_base_salary)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(p.gross_salary)}</TableCell>
                  <TableCell className="text-right text-destructive">{fmt(p.total_deductions)}</TableCell>
                  <TableCell className="text-right">{fmt(p.mpf_employee)}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(p.net_salary)}</TableCell>
                  <TableCell>{statusBadge(p.payment_status)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Payroll Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Payroll Record" : "Add Payroll Record"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <Tabs defaultValue="payroll" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="payroll" className="flex-1">Payroll Details</TabsTrigger>
                <TabsTrigger value="schedule" className="flex-1">MTD Schedule</TabsTrigger>
              </TabsList>

              <TabsContent value="payroll" className="space-y-5 mt-4">
                {/* Employee & Period */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                    <Select value={editing.employee_id || ""} onValueChange={v => updateField("employee_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Year *</label>
                    <Input type="number" value={editing.year || ""} onChange={e => numField("year", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Month *</label>
                    <Select value={String(editing.month || 1)} onValueChange={v => updateField("month", Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Earnings */}
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">Earnings</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Base Salary</label>
                      <Input type="number" value={editing.forecast_base_salary || 0} onChange={e => numField("forecast_base_salary", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Annual Leave Pay</label>
                      <Input type="number" value={editing.annual_leave_pay || 0} onChange={e => numField("annual_leave_pay", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Statutory Holiday Pay</label>
                      <Input type="number" value={editing.statutory_holiday_pay || 0} onChange={e => numField("statutory_holiday_pay", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Other Payments</label>
                      <Input type="number" value={editing.other_payments || 0} onChange={e => numField("other_payments", e.target.value)} />
                    </div>
                  </div>
                  {editing.other_payments && Number(editing.other_payments) > 0 ? (
                    <div className="mt-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Other Payments Note</label>
                      <Input value={editing.other_payments_note || ""} onChange={e => updateField("other_payments_note", e.target.value)} placeholder="Describe other payments..." />
                    </div>
                  ) : null}
                  <div className="mt-3 text-right">
                    <span className="text-xs text-muted-foreground mr-2">Gross Salary:</span>
                    <span className="text-sm font-bold">{fmt(calcTotals(editing).gross_salary)}</span>
                  </div>
                </div>

                <Separator />

                {/* Deductions */}
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">Deductions</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Sick Leave Deduction</label>
                      <Input type="number" value={editing.sick_leave_deduction || 0} onChange={e => numField("sick_leave_deduction", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Unpaid Leave Deduction</label>
                      <Input type="number" value={editing.unpaid_leave_deduction || 0} onChange={e => numField("unpaid_leave_deduction", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">MPF (Employee)</label>
                      <Input type="number" value={editing.mpf_employee || 0} onChange={e => numField("mpf_employee", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Other Deductions</label>
                      <Input type="number" value={editing.other_deductions || 0} onChange={e => numField("other_deductions", e.target.value)} />
                    </div>
                  </div>
                  {editing.other_deductions && Number(editing.other_deductions) > 0 ? (
                    <div className="mt-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Other Deductions Note</label>
                      <Input value={editing.other_deductions_note || ""} onChange={e => updateField("other_deductions_note", e.target.value)} placeholder="Describe other deductions..." />
                    </div>
                  ) : null}
                  <div className="mt-3 text-right">
                    <span className="text-xs text-muted-foreground mr-2">Total Deductions:</span>
                    <span className="text-sm font-bold text-destructive">{fmt(calcTotals(editing).total_deductions)}</span>
                  </div>
                </div>

                <Separator />

                {/* MPF & Net */}
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">MPF & Net Salary</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">MPF (Employer)</label>
                      <Input type="number" value={editing.mpf_employer || 0} onChange={e => numField("mpf_employer", e.target.value)} />
                    </div>
                    <div className="flex flex-col justify-end">
                      <div className="card-glass rounded-lg p-3 text-center">
                        <span className="text-xs text-muted-foreground block">Net Salary</span>
                        <span className="text-lg font-display font-bold text-primary">{fmt(calcTotals(editing).net_salary)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Payment Details */}
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">Payment Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Net Salary Payment Date</label>
                      <Input type="date" value={editing.net_salary_payment_date || ""} onChange={e => updateField("net_salary_payment_date", e.target.value || null)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">MPF Payment Date</label>
                      <Input type="date" value={editing.mpf_payment_date || ""} onChange={e => updateField("mpf_payment_date", e.target.value || null)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Payment Method</label>
                      <Select value={editing.payment_method || "bank_transfer"} onValueChange={v => updateField("payment_method", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Payroll Status</label>
                      <Select value={editing.payment_status || "draft"} onValueChange={v => updateField("payment_status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYROLL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                  <Input value={editing.notes || ""} onChange={e => updateField("notes", e.target.value)} />
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Payroll"}</Button>
              </TabsContent>

              <TabsContent value="schedule" className="mt-4">
                {editing.employee_id && editing.month && editing.year ? (
                  <MTDScheduleView employeeId={editing.employee_id} shifts={shifts} month={editing.month} year={editing.year} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Select an employee and period to view schedule</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
