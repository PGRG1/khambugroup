import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Users, Building2, CalendarDays, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRPayroll, HREmployee, HRShift } from "@/hooks/useHRData";

interface Props {
  payroll: HRPayroll[];
  employees: HREmployee[];
  shifts: HRShift[];
  onSave: (p: Partial<HRPayroll>) => Promise<boolean>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];
const PAYROLL_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
];

const BANK_OPTIONS = ["HSBC", "Hang Seng", "Bank of China", "ZA Bank", "Cash", "Other"];

const fmt = (v: number | null | undefined) => v != null && v !== 0 ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
const fmtInt = (v: number | null | undefined) => v != null ? String(v) : "0";

const MPF_RATE = 0.05;
const MPF_CAP = 1500;
const DAYS_IN_MONTH_DEFAULT = 31;

/* ── Inline editable cell ── */
function InlineCell({
  value, onChange, type = "number", className = "", editable = true, align = "right",
}: {
  value: number | string; onChange?: (v: string) => void; type?: string; className?: string; editable?: boolean; align?: "left" | "right" | "center";
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));

  if (!editable || !onChange) {
    return (
      <span className={`block text-[11px] tabular-nums ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}>
        {type === "number" ? fmt(Number(value)) : String(value)}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        className={`w-full bg-primary/5 border border-primary/30 rounded px-1 py-0.5 text-[11px] tabular-nums outline-none text-primary font-medium ${align === "right" ? "text-right" : "text-left"}`}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onChange(local); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(local); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <span
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className={`block text-[11px] tabular-nums cursor-pointer hover:bg-primary/5 rounded px-1 py-0.5 text-primary font-medium ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}
    >
      {type === "number" ? fmt(Number(value)) : String(value)}
    </span>
  );
}

/* ── MTD Schedule sub-view ── */
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
        <h4 className="text-sm font-semibold">MTD Schedule — {MONTHS_SHORT[month - 1]} {year}</h4>
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

/* ── Main PayrollTab ── */
export function PayrollTab({ payroll, employees, shifts, onSave }: Props) {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const [detailModal, setDetailModal] = useState<HRPayroll | null>(null);

  // Pending edits: keyed by employee_id, field name
  const [edits, setEdits] = useState<Record<string, Record<string, number | string>>>({});

  const activeEmployees = useMemo(
    () => employees.filter(e => ["active", "on_leave"].includes(e.status)).sort((a, b) => {
      const va = a.venue || "ZZZ";
      const vb = b.venue || "ZZZ";
      if (va !== vb) return va.localeCompare(vb);
      return a.sort_order - b.sort_order;
    }),
    [employees]
  );

  const filtered = useMemo(
    () => payroll.filter(p => p.year === filterYear && p.month === filterMonth),
    [payroll, filterYear, filterMonth]
  );

  // Build payroll map by employee_id
  const payrollMap = useMemo(() => {
    const map: Record<string, HRPayroll> = {};
    filtered.forEach(p => { map[p.employee_id] = p; });
    return map;
  }, [filtered]);

  // Group employees by venue
  const venueGroups = useMemo(() => {
    const groups: Record<string, HREmployee[]> = {};
    activeEmployees.forEach(emp => {
      const v = emp.venue || "Other";
      if (!groups[v]) groups[v] = [];
      groups[v].push(emp);
    });
    return groups;
  }, [activeEmployees]);

  const getEdit = (empId: string, field: string) => edits[empId]?.[field];
  const setEdit = (empId: string, field: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: field === "bank" || field === "account" ? value : Number(value) || 0 },
    }));
  };

  // Calculate row values
  const getRowData = useCallback((emp: HREmployee) => {
    const p = payrollMap[emp.id];
    const e = edits[emp.id] || {};
    const baseSalary = e.forecast_base_salary != null ? Number(e.forecast_base_salary) : Number(p?.forecast_base_salary || 0);
    const daysHours = e.days_hours != null ? Number(e.days_hours) : (p ? Number(p.forecast_allowances || DAYS_IN_MONTH_DEFAULT) : DAYS_IN_MONTH_DEFAULT);
    const isFT = emp.employment_type === "full_time";
    const earnedSalary = isFT ? baseSalary : baseSalary * daysHours;
    const alDays = e.al_days != null ? Number(e.al_days) : Number(p?.annual_leave_pay || 0);
    const nplDays = e.npl_days != null ? Number(e.npl_days) : Number(p?.unpaid_leave_deduction || 0);
    const dailyRate = isFT && DAYS_IN_MONTH_DEFAULT > 0 ? baseSalary / DAYS_IN_MONTH_DEFAULT : 0;
    const adjustments = isFT ? dailyRate * (alDays - nplDays) : 0;
    const grossPay = earnedSalary + adjustments;

    const mpfEE = Math.min(MPF_CAP, grossPay * MPF_RATE);
    const mpfER = Math.min(MPF_CAP, grossPay * MPF_RATE);
    const totalMPF = mpfEE + mpfER;
    const netPay = grossPay - mpfEE;

    const bank = e.bank != null ? String(e.bank) : (p?.payment_method || "");
    const account = e.account != null ? String(e.account) : (p?.notes || "");
    const totalCost = grossPay + mpfER;

    return {
      baseSalary, daysHours, earnedSalary, alDays, nplDays, adjustments, grossPay,
      mpfEE, mpfER, totalMPF, netPay, bank, account, totalCost,
      payrollRecord: p,
    };
  }, [payrollMap, edits]);

  // Save row
  const saveRow = async (emp: HREmployee) => {
    const row = getRowData(emp);
    const p = row.payrollRecord;
    setSaving(true);
    const payload: Partial<HRPayroll> = {
      ...(p?.id ? { id: p.id } : {}),
      employee_id: emp.id,
      year: filterYear,
      month: filterMonth,
      forecast_base_salary: row.baseSalary,
      forecast_allowances: row.daysHours,
      annual_leave_pay: row.alDays,
      unpaid_leave_deduction: row.nplDays,
      gross_salary: row.grossPay,
      mpf_employee: row.mpfEE,
      mpf_employer: row.mpfER,
      mpf_payment_amount: row.totalMPF,
      net_salary: row.netPay,
      total_deductions: row.mpfEE,
      payment_method: row.bank || "bank_transfer",
      notes: row.account,
      payment_status: p?.payment_status || "draft",
    };
    const ok = await onSave(payload);
    if (ok) {
      toast({ title: "Saved" });
      // Clear edits for this employee
      setEdits(prev => { const next = { ...prev }; delete next[emp.id]; return next; });
    }
    setSaving(false);
  };

  // Navigate months
  const prevMonth = () => {
    if (filterMonth === 1) { setFilterMonth(12); setFilterYear(y => y - 1); }
    else setFilterMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (filterMonth === 12) { setFilterMonth(1); setFilterYear(y => y + 1); }
    else setFilterMonth(m => m + 1);
  };

  // Totals
  const totals = useMemo(() => {
    const t = { headcount: 0, grossPay: 0, netPay: 0, mpfER: 0, mpfEE: 0, totalCost: 0 };
    activeEmployees.forEach(emp => {
      const row = getRowData(emp);
      if (row.baseSalary > 0 || row.earnedSalary > 0) {
        t.headcount++;
        t.grossPay += row.grossPay;
        t.netPay += row.netPay;
        t.mpfER += row.mpfER;
        t.mpfEE += row.mpfEE;
        t.totalCost += row.totalCost;
      }
    });
    return t;
  }, [activeEmployees, getRowData]);

  // Venue subtotals
  const venueSubtotals = useMemo(() => {
    const st: Record<string, { baseSalary: number; earnedSalary: number; adjustments: number; grossPay: number; mpfEE: number; mpfER: number; totalMPF: number; netPay: number; totalCost: number }> = {};
    Object.entries(venueGroups).forEach(([venue, emps]) => {
      const sub = { baseSalary: 0, earnedSalary: 0, adjustments: 0, grossPay: 0, mpfEE: 0, mpfER: 0, totalMPF: 0, netPay: 0, totalCost: 0 };
      emps.forEach(emp => {
        const row = getRowData(emp);
        sub.baseSalary += row.baseSalary;
        sub.earnedSalary += row.earnedSalary;
        sub.adjustments += row.adjustments;
        sub.grossPay += row.grossPay;
        sub.mpfEE += row.mpfEE;
        sub.mpfER += row.mpfER;
        sub.totalMPF += row.totalMPF;
        sub.netPay += row.netPay;
        sub.totalCost += row.totalCost;
      });
      st[venue] = sub;
    });
    return st;
  }, [venueGroups, getRowData]);

  const grandTotal = useMemo(() => {
    const gt = { baseSalary: 0, earnedSalary: 0, adjustments: 0, grossPay: 0, mpfEE: 0, mpfER: 0, totalMPF: 0, netPay: 0, totalCost: 0 };
    Object.values(venueSubtotals).forEach(sub => {
      gt.baseSalary += sub.baseSalary;
      gt.earnedSalary += sub.earnedSalary;
      gt.adjustments += sub.adjustments;
      gt.grossPay += sub.grossPay;
      gt.mpfEE += sub.mpfEE;
      gt.mpfER += sub.mpfER;
      gt.totalMPF += sub.totalMPF;
      gt.netPay += sub.netPay;
      gt.totalCost += sub.totalCost;
    });
    return gt;
  }, [venueSubtotals]);

  // Payment status overview
  const payStatus = useMemo(() => {
    const statuses = filtered.map(p => p.payment_status);
    const allPaid = statuses.length > 0 && statuses.every(s => s === "paid");
    return allPaid ? "Paid" : "Pending";
  }, [filtered]);

  const avgSalary = totals.headcount > 0 ? totals.grossPay / totals.headcount : 0;

  const sectionHeaderClass = "bg-foreground text-background text-[11px] font-bold uppercase tracking-wider px-3 py-1.5";
  const thClass = "text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 whitespace-nowrap";
  const tdClass = "px-2 py-1 text-[11px] tabular-nums whitespace-nowrap";
  const subtotalClass = "bg-muted/70 font-bold";

  let rowNum = 0;

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">Period</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-display font-bold min-w-[180px] text-center">
            {MONTHS[filterMonth - 1]} {filterYear}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── PAYROLL SUMMARY & MPF DETAILS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-md overflow-hidden">
          <div className={sectionHeaderClass}>Payroll Summary</div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div>
              <span className="text-muted-foreground block">Total Headcount</span>
              <span className="font-bold text-sm">{totals.headcount}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total Gross Pay</span>
              <span className="font-bold text-sm">${fmt(totals.grossPay)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total Net Pay</span>
              <span className="font-bold text-sm">${fmt(totals.netPay)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total MPF (ER)</span>
              <span className="font-bold text-sm">${fmt(totals.mpfER)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Avg Salary</span>
              <span className="font-bold text-sm">${fmt(avgSalary)}</span>
            </div>
            {Object.entries(venueSubtotals).map(([venue, sub]) => (
              <div key={venue}>
                <span className="text-muted-foreground block">{venue}</span>
                <span className="font-bold text-sm">${fmt(sub.grossPay)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-border rounded-md overflow-hidden">
          <div className={sectionHeaderClass}>MPF & Payment Details</div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div>
              <span className="text-muted-foreground block">MPF Cap</span>
              <span className="font-bold text-sm">${fmt(MPF_CAP)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">MPF Rate</span>
              <span className="font-bold text-sm">{(MPF_RATE * 100).toFixed(0)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Days in Month</span>
              <span className="font-bold text-sm">{new Date(filterYear, filterMonth, 0).getDate()}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Status</span>
              <Badge variant={payStatus === "Paid" ? "default" : "outline"} className="text-[10px]">{payStatus}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground block">Total MPF (EE)</span>
              <span className="font-bold text-sm">${fmt(totals.mpfEE)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total MPF (ER)</span>
              <span className="font-bold text-sm">${fmt(totals.mpfER)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── EMPLOYEE PAYROLL TABLE ── */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="flex">
          <div className={`${sectionHeaderClass} flex-1`}>Employee Payroll</div>
          <div className={`${sectionHeaderClass} flex-1 text-right`}>MPF & Payment</div>
          <div className={`${sectionHeaderClass} text-right`} style={{ minWidth: 80 }}>Salary Expense</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={`${thClass} text-center w-8`}>No</th>
                <th className={`${thClass} min-w-[120px]`}>Employee Name</th>
                <th className={`${thClass} min-w-[80px]`}>Department</th>
                <th className={`${thClass} min-w-[90px]`}>Position</th>
                <th className={`${thClass} w-10 text-center`}>Type</th>
                <th className={`${thClass} text-right min-w-[80px]`}>Basic Salary</th>
                <th className={`${thClass} text-right w-14`}>Days/Hrs</th>
                <th className={`${thClass} text-right min-w-[80px] bg-muted/80`}>Earned Salary</th>
                <th className={`${thClass} text-right w-12`}>AL Days</th>
                <th className={`${thClass} text-right w-12`}>NPL Days</th>
                <th className={`${thClass} text-right min-w-[70px] bg-muted/80`}>Adjustments</th>
                <th className={`${thClass} text-right min-w-[80px] bg-muted/80`}>Gross Pay</th>
                <th className="border-l border-border w-[1px]" />
                <th className={`${thClass} text-right min-w-[70px]`}>MPF (EE)</th>
                <th className={`${thClass} text-right min-w-[70px]`}>MPF (ER)</th>
                <th className={`${thClass} text-right min-w-[70px] bg-muted/80`}>Total MPF</th>
                <th className={`${thClass} text-right min-w-[80px] font-bold`}>Net Pay</th>
                <th className={`${thClass} min-w-[70px]`}>Bank</th>
                <th className={`${thClass} min-w-[100px]`}>Account</th>
                <th className="border-l border-border w-[1px]" />
                <th className={`${thClass} text-right min-w-[80px] font-bold`}>Total Cost</th>
                <th className={`${thClass} w-8`} />
              </tr>
            </thead>
            <tbody>
              {Object.entries(venueGroups).map(([venue, emps]) => (
                <>
                  {emps.map((emp) => {
                    rowNum++;
                    const row = getRowData(emp);
                    const hasEdits = !!edits[emp.id];
                    const typeLabel = emp.employment_type === "full_time" ? "FT" : emp.employment_type === "part_time" ? "PT" : "C";
                    return (
                      <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className={`${tdClass} text-center text-muted-foreground`}>{rowNum}</td>
                        <td className={`${tdClass} font-medium`}>{emp.last_name}, {emp.first_name}</td>
                        <td className={`${tdClass} text-muted-foreground`}>{venue}</td>
                        <td className={`${tdClass} text-muted-foreground`}>{emp.job_title || "—"}</td>
                        <td className={`${tdClass} text-center`}>{typeLabel}</td>
                        <td className={tdClass}>
                          <InlineCell value={row.baseSalary} onChange={v => setEdit(emp.id, "forecast_base_salary", v)} editable />
                        </td>
                        <td className={tdClass}>
                          <InlineCell value={row.daysHours} onChange={v => setEdit(emp.id, "days_hours", v)} editable />
                        </td>
                        <td className={`${tdClass} bg-muted/30`}>
                          <InlineCell value={row.earnedSalary} editable={false} />
                        </td>
                        <td className={tdClass}>
                          <InlineCell value={row.alDays} onChange={v => setEdit(emp.id, "al_days", v)} editable />
                        </td>
                        <td className={tdClass}>
                          <InlineCell value={row.nplDays} onChange={v => setEdit(emp.id, "npl_days", v)} editable />
                        </td>
                        <td className={`${tdClass} bg-muted/30`}>
                          <InlineCell value={row.adjustments} editable={false} className={row.adjustments < 0 ? "text-destructive" : ""} />
                        </td>
                        <td className={`${tdClass} bg-muted/30`}>
                          <InlineCell value={row.grossPay} editable={false} />
                        </td>
                        <td className="border-l border-border" />
                        <td className={`${tdClass}`}>
                          <InlineCell value={row.mpfEE} editable={false} />
                        </td>
                        <td className={`${tdClass}`}>
                          <InlineCell value={row.mpfER} editable={false} />
                        </td>
                        <td className={`${tdClass} bg-muted/30`}>
                          <InlineCell value={row.totalMPF} editable={false} />
                        </td>
                        <td className={`${tdClass} font-bold`}>
                          <InlineCell value={row.netPay} editable={false} className="font-bold" />
                        </td>
                        <td className={tdClass}>
                          <InlineCell value={row.bank || ""} type="text" onChange={v => setEdit(emp.id, "bank", v)} editable align="left" />
                        </td>
                        <td className={tdClass}>
                          <InlineCell value={row.account || ""} type="text" onChange={v => setEdit(emp.id, "account", v)} editable align="left" />
                        </td>
                        <td className="border-l border-border" />
                        <td className={`${tdClass} font-bold`}>
                          <InlineCell value={row.totalCost} editable={false} className="font-bold" />
                        </td>
                        <td className={tdClass}>
                          {hasEdits && (
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => saveRow(emp)} disabled={saving}>
                              <Pencil className="h-3 w-3 text-primary" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Venue Subtotal */}
                  <tr key={`sub-${venue}`} className={`border-b border-border ${subtotalClass}`}>
                    <td className={tdClass} />
                    <td colSpan={4} className={`${tdClass} font-bold`}>{venue} Subtotal</td>
                    <td className={`${tdClass} text-right font-bold`}>{fmt(venueSubtotals[venue]?.baseSalary)}</td>
                    <td className={tdClass} />
                    <td className={`${tdClass} text-right font-bold bg-muted/50`}>{fmt(venueSubtotals[venue]?.earnedSalary)}</td>
                    <td className={tdClass} />
                    <td className={tdClass} />
                    <td className={`${tdClass} text-right font-bold bg-muted/50`}>{fmt(venueSubtotals[venue]?.adjustments)}</td>
                    <td className={`${tdClass} text-right font-bold bg-muted/50`}>{fmt(venueSubtotals[venue]?.grossPay)}</td>
                    <td className="border-l border-border" />
                    <td className={`${tdClass} text-right font-bold`}>{fmt(venueSubtotals[venue]?.mpfEE)}</td>
                    <td className={`${tdClass} text-right font-bold`}>{fmt(venueSubtotals[venue]?.mpfER)}</td>
                    <td className={`${tdClass} text-right font-bold bg-muted/50`}>{fmt(venueSubtotals[venue]?.totalMPF)}</td>
                    <td className={`${tdClass} text-right font-bold`}>{fmt(venueSubtotals[venue]?.netPay)}</td>
                    <td colSpan={2} className={tdClass} />
                    <td className="border-l border-border" />
                    <td className={`${tdClass} text-right font-bold`}>{fmt(venueSubtotals[venue]?.totalCost)}</td>
                    <td className={tdClass} />
                  </tr>
                  {/* Spacer */}
                  <tr key={`spacer-${venue}`}><td colSpan={22} className="h-2" /></tr>
                </>
              ))}
              {/* GRAND TOTAL */}
              <tr className="bg-foreground text-background font-bold border-t-2 border-foreground">
                <td className={tdClass} />
                <td colSpan={4} className={`${tdClass} font-bold text-background`}>GRAND TOTAL</td>
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.baseSalary)}</td>
                <td className={tdClass} />
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.earnedSalary)}</td>
                <td className={tdClass} />
                <td className={tdClass} />
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.adjustments)}</td>
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.grossPay)}</td>
                <td className="border-l border-background/30" />
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.mpfEE)}</td>
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.mpfER)}</td>
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.totalMPF)}</td>
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.netPay)}</td>
                <td colSpan={2} className={tdClass} />
                <td className="border-l border-background/30" />
                <td className={`${tdClass} text-right text-background`}>{fmt(grandTotal.totalCost)}</td>
                <td className={tdClass} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── INPUT LEGEND ── */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className={sectionHeaderClass}>Input Legend</div>
        <div className="p-3 text-[11px] text-muted-foreground space-y-2">
          <p><span className="text-primary font-medium">Blue text with highlight</span> = Editable input fields</p>
          <p><span className="text-muted-foreground">Gray background</span> = Calculated values (do not edit)</p>
          <div className="mt-3">
            <p className="font-semibold text-foreground mb-1">Key Inputs:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Basic Salary — Monthly salary for FT, hourly rate for PT</li>
              <li>Days/Hours — Working days for FT, hours worked for PT</li>
              <li>AL Days — Annual leave days taken</li>
              <li>NPL Days — No-pay leave / sick leave days</li>
            </ul>
          </div>
          <div className="mt-3">
            <p className="font-semibold text-foreground mb-1">Formulas:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Earned Salary: FT = Basic Salary, PT = Rate × Hours</li>
              <li>Adjustments: Basic Salary ÷ Days in Month × (AL Days − NPL Days)</li>
              <li>Gross Pay: Earned Salary + Adjustments</li>
              <li>MPF (EE/ER): MIN(MPF Cap, Gross Pay × {(MPF_RATE * 100).toFixed(0)}%)</li>
              <li>Net Pay: Gross Pay − MPF (EE)</li>
              <li>Total Cost: Gross Pay + MPF (ER)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!detailModal} onOpenChange={() => setDetailModal(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailModal && (() => {
                const emp = employees.find(e => e.id === detailModal.employee_id);
                return emp ? `${emp.first_name} ${emp.last_name} — ${MONTHS_SHORT[detailModal.month - 1]} ${detailModal.year}` : "Payroll Detail";
              })()}
            </DialogTitle>
          </DialogHeader>
          {detailModal && detailModal.employee_id && (
            <MTDScheduleView employeeId={detailModal.employee_id} shifts={shifts} month={detailModal.month} year={detailModal.year} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
