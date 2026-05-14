import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
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

const MPF_RATE = 0.05;
const MPF_CAP = 1500;

const n = (v: number | null | undefined) => Number(v || 0);
const fmt = (v: number) => v !== 0 ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";

/* ── Editable cell ── */
function ECell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        className="w-full bg-chart-1/5 border border-chart-1/40 rounded px-1.5 py-0.5 text-[11px] tabular-nums text-right text-chart-1 font-semibold outline-none"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onChange(Number(local) || 0); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(Number(local) || 0); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <div
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className="text-right text-[11px] tabular-nums cursor-pointer rounded px-1.5 py-0.5 text-chart-1 font-semibold hover:bg-chart-1/5 transition-colors"
    >
      {fmt(value)}
    </div>
  );
}

/* ── Editable text cell ── */
function ETextCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        className="w-full bg-chart-1/5 border border-chart-1/40 rounded px-1.5 py-0.5 text-[11px] text-chart-1 font-semibold outline-none"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onChange(local); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(local); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <div
      onClick={() => { setLocal(value); setEditing(true); }}
      className="text-[11px] tabular-nums cursor-pointer rounded px-1.5 py-0.5 text-chart-1 font-semibold hover:bg-chart-1/5 transition-colors truncate"
    >
      {value || "—"}
    </div>
  );
}

/* ── Static number cell ── */
function SCell({ value, bold, negative }: { value: number; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`text-right text-[11px] tabular-nums px-1.5 py-0.5 ${bold ? "font-bold" : ""} ${negative && value < 0 ? "text-destructive" : ""}`}>
      {fmt(value)}
    </div>
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

  const labels: Record<string, string> = {
    regular: "Work", al: "AL", sh: "SH", ph: "PH", sick_no_pay: "Sick (NP)", no_pay: "No Pay", off: "OFF", rest: "Rest", training: "Training",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">MTD Schedule — {MONTHS_SHORT[month - 1]} {year}</h4>
        <Badge variant="secondary">{totalHours.toFixed(1)} hrs total</Badge>
      </div>
      {monthShifts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No shifts scheduled</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Day</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Start</TableHead>
              <TableHead className="text-xs">End</TableHead>
              <TableHead className="text-xs">Break</TableHead>
              <TableHead className="text-xs text-right">Hours</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {monthShifts.map(sh => {
                const d = new Date(sh.shift_date);
                const [sh1, sm1] = sh.start_time.split(":").map(Number);
                const [sh2, sm2] = sh.end_time.split(":").map(Number);
                let hrs = (sh2 * 60 + sm2 - sh1 * 60 - sm1 - (sh.break_minutes || 0)) / 60;
                if (hrs < 0) hrs += 24;
                const isLeave = ["al", "sh", "ph", "sick_no_pay", "no_pay", "off", "rest"].includes(sh.shift_type || "regular");
                return (
                  <TableRow key={sh.id} className={isLeave ? "bg-muted/30" : ""}>
                    <TableCell className="text-xs py-1.5">{sh.shift_date}</TableCell>
                    <TableCell className="text-xs py-1.5">{d.toLocaleDateString("en-US", { weekday: "short" })}</TableCell>
                    <TableCell className="text-xs py-1.5"><Badge variant={isLeave ? "outline" : "secondary"} className="text-[10px]">{labels[sh.shift_type || "regular"] || sh.shift_type}</Badge></TableCell>
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

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export function PayrollTab({ payroll, employees, shifts, onSave }: Props) {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const [detailModal, setDetailModal] = useState<HRPayroll | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, number | string>>>({});

  const daysInMonth = new Date(filterYear, filterMonth, 0).getDate();

  const activeEmployees = useMemo(
    () => employees.filter(e => ["active", "on_leave"].includes(e.status)).sort((a, b) => {
      const va = a.venue || "ZZZ"; const vb = b.venue || "ZZZ";
      if (va !== vb) return va.localeCompare(vb);
      return a.sort_order - b.sort_order;
    }),
    [employees]
  );

  const filtered = useMemo(
    () => payroll.filter(p => p.year === filterYear && p.month === filterMonth),
    [payroll, filterYear, filterMonth]
  );

  const payrollMap = useMemo(() => {
    const map: Record<string, HRPayroll> = {};
    filtered.forEach(p => { map[p.employee_id] = p; });
    return map;
  }, [filtered]);

  const venueGroups = useMemo(() => {
    const g: Record<string, HREmployee[]> = {};
    activeEmployees.forEach(emp => {
      const v = emp.venue || "Other";
      if (!g[v]) g[v] = [];
      g[v].push(emp);
    });
    return g;
  }, [activeEmployees]);

  const setEdit = (empId: string, field: string, value: number | string) => {
    setEdits(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
  };

  const getRowData = useCallback((emp: HREmployee) => {
    const p = payrollMap[emp.id];
    const e = edits[emp.id] || {};
    const baseSalary = e.forecast_base_salary != null ? Number(e.forecast_base_salary) : n(p?.forecast_base_salary);
    const daysHours = e.days_hours != null ? Number(e.days_hours) : (p ? n(p.forecast_allowances) || daysInMonth : daysInMonth);
    const isFT = emp.employment_type === "full_time";
    const computedEarned = isFT ? baseSalary : baseSalary * daysHours;
    const earnedOverride = e.earned_salary_override !== undefined
      ? (e.earned_salary_override === "" ? null : Number(e.earned_salary_override))
      : (p?.earned_salary_override ?? null);
    const earnedSalary = earnedOverride != null ? earnedOverride : computedEarned;
    const alDays = e.al_days != null ? Number(e.al_days) : n(p?.annual_leave_pay);
    const nplDays = e.npl_days != null ? Number(e.npl_days) : n(p?.unpaid_leave_deduction);
    const dailyRate = isFT && daysInMonth > 0 ? baseSalary / daysInMonth : 0;
    const computedAdj = isFT ? dailyRate * (alDays - nplDays) : 0;
    const adjOverride = e.adjustments_override !== undefined
      ? (e.adjustments_override === "" ? null : Number(e.adjustments_override))
      : (p?.adjustments_override ?? null);
    const adjustments = adjOverride != null ? adjOverride : computedAdj;
    const grossPay = earnedSalary + adjustments;
    const computedMpfEE = Math.min(MPF_CAP, grossPay * MPF_RATE);
    const computedMpfER = Math.min(MPF_CAP, grossPay * MPF_RATE);
    const mpfEEOverride = e.mpf_employee_override !== undefined
      ? (e.mpf_employee_override === "" ? null : Number(e.mpf_employee_override))
      : (p?.mpf_employee_override ?? null);
    const mpfEROverride = e.mpf_employer_override !== undefined
      ? (e.mpf_employer_override === "" ? null : Number(e.mpf_employer_override))
      : (p?.mpf_employer_override ?? null);
    const mpfEE = mpfEEOverride != null ? mpfEEOverride : computedMpfEE;
    const mpfER = mpfEROverride != null ? mpfEROverride : computedMpfER;
    const totalMPF = mpfEE + mpfER;
    const netPay = grossPay - mpfEE;
    const bank = e.bank != null ? String(e.bank) : (p?.payment_method || "");
    const account = e.account != null ? String(e.account) : (p?.notes || "");
    const totalCost = grossPay + mpfER;
    return { baseSalary, daysHours, earnedSalary, alDays, nplDays, adjustments, grossPay, mpfEE, mpfER, totalMPF, netPay, bank, account, totalCost, payrollRecord: p, earnedOverride, adjOverride, mpfEEOverride, mpfEROverride };
  }, [payrollMap, edits, daysInMonth]);

  const saveRow = async (emp: HREmployee) => {
    const row = getRowData(emp);
    const p = row.payrollRecord;
    setSaving(true);
    const ok = await onSave({
      ...(p?.id ? { id: p.id } : {}),
      employee_id: emp.id, year: filterYear, month: filterMonth,
      forecast_base_salary: row.baseSalary, forecast_allowances: row.daysHours,
      annual_leave_pay: row.alDays, unpaid_leave_deduction: row.nplDays,
      gross_salary: row.grossPay, mpf_employee: row.mpfEE, mpf_employer: row.mpfER,
      mpf_payment_amount: row.totalMPF, net_salary: row.netPay, total_deductions: row.mpfEE,
      payment_method: row.bank || "bank_transfer", notes: row.account,
      payment_status: p?.payment_status || "draft",
      earned_salary_override: row.earnedOverride,
      adjustments_override: row.adjOverride,
      mpf_employee_override: row.mpfEEOverride,
      mpf_employer_override: row.mpfEROverride,
    });
    if (ok) { toast({ title: "Saved" }); setEdits(prev => { const next = { ...prev }; delete next[emp.id]; return next; }); }
    setSaving(false);
  };

  const prevMonth = () => { if (filterMonth === 1) { setFilterMonth(12); setFilterYear(y => y - 1); } else setFilterMonth(m => m - 1); };
  const nextMonth = () => { if (filterMonth === 12) { setFilterMonth(1); setFilterYear(y => y + 1); } else setFilterMonth(m => m + 1); };

  // Aggregates
  const venueSubtotals = useMemo(() => {
    const st: Record<string, { baseSalary: number; earnedSalary: number; adjustments: number; grossPay: number; mpfEE: number; mpfER: number; totalMPF: number; netPay: number; totalCost: number }> = {};
    Object.entries(venueGroups).forEach(([venue, emps]) => {
      const sub = { baseSalary: 0, earnedSalary: 0, adjustments: 0, grossPay: 0, mpfEE: 0, mpfER: 0, totalMPF: 0, netPay: 0, totalCost: 0 };
      emps.forEach(emp => { const r = getRowData(emp); sub.baseSalary += r.baseSalary; sub.earnedSalary += r.earnedSalary; sub.adjustments += r.adjustments; sub.grossPay += r.grossPay; sub.mpfEE += r.mpfEE; sub.mpfER += r.mpfER; sub.totalMPF += r.totalMPF; sub.netPay += r.netPay; sub.totalCost += r.totalCost; });
      st[venue] = sub;
    });
    return st;
  }, [venueGroups, getRowData]);

  const grandTotal = useMemo(() => {
    const gt = { baseSalary: 0, earnedSalary: 0, adjustments: 0, grossPay: 0, mpfEE: 0, mpfER: 0, totalMPF: 0, netPay: 0, totalCost: 0, headcount: 0 };
    Object.values(venueSubtotals).forEach(sub => { gt.baseSalary += sub.baseSalary; gt.earnedSalary += sub.earnedSalary; gt.adjustments += sub.adjustments; gt.grossPay += sub.grossPay; gt.mpfEE += sub.mpfEE; gt.mpfER += sub.mpfER; gt.totalMPF += sub.totalMPF; gt.netPay += sub.netPay; gt.totalCost += sub.totalCost; });
    activeEmployees.forEach(emp => { const r = getRowData(emp); if (r.baseSalary > 0) gt.headcount++; });
    return gt;
  }, [venueSubtotals, activeEmployees, getRowData]);

  const payStatus = useMemo(() => {
    const s = filtered.map(p => p.payment_status);
    return s.length > 0 && s.every(x => x === "paid") ? "Paid" : "Pending";
  }, [filtered]);

  const avgSalary = grandTotal.headcount > 0 ? grandTotal.grossPay / grandTotal.headcount : 0;

  const hasAnyEdits = Object.keys(edits).length > 0;

  const saveAll = async () => {
    const empIds = Object.keys(edits);
    for (const empId of empIds) {
      const emp = employees.find(e => e.id === empId);
      if (emp) await saveRow(emp);
    }
  };

  /* ── Styles ── */
  const hdr = "bg-foreground text-background text-[11px] font-bold uppercase tracking-wider px-3 py-1.5";
  const th = "text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap border-b border-border";
  const thP = "px-2 py-2"; // padding for th
  const td = "text-[11px] tabular-nums whitespace-nowrap px-2 py-1.5 border-b border-border/40";
  const calc = "bg-muted/40"; // calculated column bg

  let rowNum = 0;

  return (
    <div className="space-y-4">
      {/* ── Period nav ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Period</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-base font-display font-bold min-w-[160px] text-center">{MONTHS[filterMonth - 1]} {filterYear}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {hasAnyEdits && (
          <Button size="sm" onClick={saveAll} disabled={saving} className="h-7 text-xs gap-1">
            <Save className="h-3.5 w-3.5" /> Save All Changes
          </Button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Payroll Summary */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className={hdr}>Payroll Summary</div>
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            {[
              ["Total Headcount", String(grandTotal.headcount)],
              ["Avg Salary", `$${fmt(avgSalary)}`],
              ["MPF Rate", `${(MPF_RATE * 100).toFixed(0)}%`],
              ["Days in Month", String(daysInMonth)],
            ].map(([label, val]) => (
              <div key={label} className="px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className="text-sm font-bold">{val}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 divide-x divide-border">
            {[
              ["Total Gross Pay", `$${fmt(grandTotal.grossPay)}`],
              ["Total Net Pay", `$${fmt(grandTotal.netPay)}`],
              ["Total MPF (ER)", `$${fmt(grandTotal.mpfER)}`],
              ["Status", payStatus],
            ].map(([label, val]) => (
              <div key={label} className="px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                {label === "Status" ? (
                  <Badge variant={val === "Paid" ? "default" : "outline"} className="text-[10px] mt-0.5">{val}</Badge>
                ) : (
                  <div className="text-sm font-bold">{val}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* MPF & Venue breakdown */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className={hdr}>MPF & Payment Details</div>
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            {[
              ["MPF Cap", `$${fmt(MPF_CAP)}`],
              ["Total MPF (EE)", `$${fmt(grandTotal.mpfEE)}`],
              ["Total MPF (ER)", `$${fmt(grandTotal.mpfER)}`],
              ["Total Cost", `$${fmt(grandTotal.totalCost)}`],
            ].map(([label, val]) => (
              <div key={label} className="px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className="text-sm font-bold">{val}</div>
              </div>
            ))}
          </div>
          <div className="flex divide-x divide-border">
            {Object.entries(venueSubtotals).map(([venue, sub]) => (
              <div key={venue} className="px-3 py-2 flex-1">
                <div className="text-[10px] text-muted-foreground">{venue}</div>
                <div className="text-sm font-bold">${fmt(sub.grossPay)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Employee Payroll Table ── */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className={hdr}>Employee Payroll</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/60">
                <th className={`${th} ${thP} text-center w-9`}>No</th>
                <th className={`${th} ${thP} text-left min-w-[130px]`}>Employee Name</th>
                <th className={`${th} ${thP} text-left min-w-[80px]`}>Dept</th>
                <th className={`${th} ${thP} text-left min-w-[90px]`}>Position</th>
                <th className={`${th} ${thP} text-center w-10`}>Type</th>
                <th className={`${th} ${thP} text-right min-w-[85px]`}>Basic Salary</th>
                <th className={`${th} ${thP} text-right w-16`}>Days/Hrs</th>
                <th className={`${th} ${thP} text-right min-w-[90px] ${calc}`}>Earned Salary</th>
                <th className={`${th} ${thP} text-right w-14`}>AL Days</th>
                <th className={`${th} ${thP} text-right w-14`}>NPL Days</th>
                <th className={`${th} ${thP} text-right min-w-[80px] ${calc}`}>Adjustments</th>
                <th className={`${th} ${thP} text-right min-w-[90px] ${calc}`}>Gross Pay</th>
                <th className={`${th} ${thP} text-right min-w-[75px]`}>MPF (EE)</th>
                <th className={`${th} ${thP} text-right min-w-[75px]`}>MPF (ER)</th>
                <th className={`${th} ${thP} text-right min-w-[75px] ${calc}`}>Total MPF</th>
                <th className={`${th} ${thP} text-right min-w-[90px]`}>Net Pay</th>
                <th className={`${th} ${thP} text-left min-w-[80px]`}>Bank</th>
                <th className={`${th} ${thP} text-left min-w-[120px]`}>Account</th>
                <th className={`${th} ${thP} text-right min-w-[90px]`}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(venueGroups).map(([venue, emps]) => (
                <>
                  {emps.map((emp) => {
                    rowNum++;
                    const row = getRowData(emp);
                    const hasEdits = !!edits[emp.id];
                    const type = emp.employment_type === "full_time" ? "FT" : emp.employment_type === "part_time" ? "PT" : "C";
                    return (
                      <tr key={emp.id} className={`hover:bg-muted/20 ${hasEdits ? "bg-chart-1/[0.03]" : ""}`}>
                        <td className={`${td} text-center text-muted-foreground text-[10px]`}>{rowNum}</td>
                        <td className={`${td} font-medium`}>{emp.last_name}, {emp.first_name}</td>
                        <td className={`${td} text-muted-foreground`}>{venue}</td>
                        <td className={`${td} text-muted-foreground`}>{emp.job_title || "—"}</td>
                        <td className={`${td} text-center font-medium`}>{type}</td>
                        <td className={td}><ECell value={row.baseSalary} onChange={v => setEdit(emp.id, "forecast_base_salary", v)} /></td>
                        <td className={td}><ECell value={row.daysHours} onChange={v => setEdit(emp.id, "days_hours", v)} /></td>
                        <td className={`${td} ${calc}`}><SCell value={row.earnedSalary} /></td>
                        <td className={td}><ECell value={row.alDays} onChange={v => setEdit(emp.id, "al_days", v)} /></td>
                        <td className={td}><ECell value={row.nplDays} onChange={v => setEdit(emp.id, "npl_days", v)} /></td>
                        <td className={`${td} ${calc}`}><SCell value={row.adjustments} negative /></td>
                        <td className={`${td} ${calc}`}><SCell value={row.grossPay} /></td>
                        <td className={td}><SCell value={row.mpfEE} /></td>
                        <td className={td}><SCell value={row.mpfER} /></td>
                        <td className={`${td} ${calc}`}><SCell value={row.totalMPF} /></td>
                        <td className={`${td} font-bold`}><SCell value={row.netPay} bold /></td>
                        <td className={td}><ETextCell value={row.bank} onChange={v => setEdit(emp.id, "bank", v)} /></td>
                        <td className={td}><ETextCell value={row.account} onChange={v => setEdit(emp.id, "account", v)} /></td>
                        <td className={`${td} font-bold`}><SCell value={row.totalCost} bold /></td>
                      </tr>
                    );
                  })}
                  {/* Venue subtotal */}
                  <tr key={`sub-${venue}`} className="bg-muted/70 border-b border-border">
                    <td className={td} />
                    <td colSpan={4} className={`${td} font-bold text-xs`}>{venue} Subtotal</td>
                    <td className={`${td} text-right font-bold`}>{fmt(venueSubtotals[venue]?.baseSalary)}</td>
                    <td className={td} />
                    <td className={`${td} text-right font-bold ${calc}`}>{fmt(venueSubtotals[venue]?.earnedSalary)}</td>
                    <td className={td} />
                    <td className={td} />
                    <td className={`${td} text-right font-bold ${calc}`}>{fmt(venueSubtotals[venue]?.adjustments)}</td>
                    <td className={`${td} text-right font-bold ${calc}`}>{fmt(venueSubtotals[venue]?.grossPay)}</td>
                    <td className={`${td} text-right font-bold`}>{fmt(venueSubtotals[venue]?.mpfEE)}</td>
                    <td className={`${td} text-right font-bold`}>{fmt(venueSubtotals[venue]?.mpfER)}</td>
                    <td className={`${td} text-right font-bold ${calc}`}>{fmt(venueSubtotals[venue]?.totalMPF)}</td>
                    <td className={`${td} text-right font-bold`}>{fmt(venueSubtotals[venue]?.netPay)}</td>
                    <td colSpan={2} className={td} />
                    <td className={`${td} text-right font-bold`}>{fmt(venueSubtotals[venue]?.totalCost)}</td>
                  </tr>
                  <tr key={`sp-${venue}`}><td colSpan={19} className="h-1 bg-background" /></tr>
                </>
              ))}
              {/* Grand total */}
              <tr className="bg-foreground text-background">
                <td className={`${td} border-0`} />
                <td colSpan={4} className={`${td} border-0 font-bold text-background text-xs`}>GRAND TOTAL</td>
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.baseSalary)}</td>
                <td className={`${td} border-0`} />
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.earnedSalary)}</td>
                <td className={`${td} border-0`} />
                <td className={`${td} border-0`} />
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.adjustments)}</td>
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.grossPay)}</td>
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.mpfEE)}</td>
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.mpfER)}</td>
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.totalMPF)}</td>
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.netPay)}</td>
                <td colSpan={2} className={`${td} border-0`} />
                <td className={`${td} border-0 text-right font-bold text-background`}>{fmt(grandTotal.totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className={hdr}>Input Legend</div>
        <div className="p-3 text-[11px] text-muted-foreground grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="mb-2"><span className="text-chart-1 font-semibold">Blue text</span> = Editable &nbsp;|&nbsp; <span className="bg-muted/40 px-1 rounded">Gray bg</span> = Calculated</p>
            <p className="font-semibold text-foreground mb-1">Key Inputs:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Basic Salary — Monthly salary (FT), hourly rate (PT)</li>
              <li>Days/Hours — Working days (FT), hours worked (PT)</li>
              <li>AL Days — Annual leave days taken</li>
              <li>NPL Days — No-pay leave / sick leave days</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">Formulas:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Earned Salary: FT = Basic Salary, PT = Rate × Hours</li>
              <li>Adjustments: Basic Salary ÷ Days in Month × (AL − NPL)</li>
              <li>Gross Pay: Earned Salary + Adjustments</li>
              <li>MPF (EE/ER): MIN(Cap, Gross Pay × 5%)</li>
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
          {detailModal?.employee_id && (
            <MTDScheduleView employeeId={detailModal.employee_id} shifts={shifts} month={detailModal.month} year={detailModal.year} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
