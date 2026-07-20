import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft, ChevronRight, Save, BookOpen, Banknote, RotateCcw, X, Plus, Landmark, Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRPayroll, HREmployee, HRShift } from "@/hooks/useHRData";
import { supabase } from "@/integrations/supabase/client";
import { PayrollPaymentDialog } from "./PayrollPaymentDialog";
import { usePayrollPaymentBatches } from "@/hooks/usePayrollPaymentBatches";
import { PayrollLaborCostCard } from "./PayrollLaborCostCard";
import PayrollImportDialog, { EmployeePicker, type PayrollImportApplyPayload } from "./PayrollImportDialog";
import { useVenues } from "@/hooks/useVenues";

const UNASSIGNED = "Unassigned";

interface Props {
  payroll: HRPayroll[];
  employees: HREmployee[];
  shifts: HRShift[];
  departments: { id: string; name: string; is_active: boolean }[];
  onSave: (p: Partial<HRPayroll>) => Promise<boolean>;
  onSaveBatch?: (rows: Partial<HRPayroll>[]) => Promise<{ ok: boolean; error?: string }>;
  onCreateEmployee: (emp: Partial<HREmployee>) => Promise<HREmployee | null>;
  initialYear?: number;
  initialMonth?: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const MPF_RATE = 0.05;
const MPF_CAP = 1500;

const n = (v: number | null | undefined) => Number(v || 0);
const fmt = (v: number) => (v !== 0 ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00");

/* ── Section label (replaces heavy black hdr bar) ── */
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-3">
      <h3 className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
        {children}
      </h3>
      {right}
    </div>
  );
}

/* ── Cell styling helpers ─────────────────────────────── */
const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none";
const cellBase =
  "block w-full text-right text-[12px] tabular-nums px-2 py-1 rounded-sm outline-none transition-colors";
const editableIdle = "cursor-text hover:bg-muted/50 focus:bg-muted/60 focus:ring-1 focus:ring-primary/40 focus:border-b focus:border-primary";
const calcIdle = "text-muted-foreground";

function ECell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  if (editing) {
    return (
      <input
        autoFocus type="number"
        className={`${cellBase} bg-muted/60 ring-1 ring-primary/40 ${NO_SPINNER}`}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onChange(Number(local) || 0); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(Number(local) || 0); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
    );
  }
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      onKeyDown={e => { if (e.key === "Enter") { setLocal(String(value)); setEditing(true); } }}
      className={`${cellBase} ${editableIdle}`}
    >
      {fmt(value)}
    </div>
  );
}

function SCell({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <div className={`${cellBase} ${calcIdle} ${bold ? "font-semibold text-foreground" : ""}`}>
      {fmt(value)}
    </div>
  );
}

function OCell({ value, isOverride, onChange }: { value: number; isOverride: boolean; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  const commit = () => {
    const trimmed = local.trim();
    onChange(trimmed === "" ? null : Number(trimmed) || 0);
    setEditing(false);
  };
  if (editing) {
    return (
      <input
        autoFocus type="number" placeholder="auto"
        className={`${cellBase} bg-muted/60 ring-1 ring-primary/40 ${NO_SPINNER}`}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      />
    );
  }
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => { setLocal(isOverride ? String(value) : ""); setEditing(true); }}
      onKeyDown={e => { if (e.key === "Enter") { setLocal(isOverride ? String(value) : ""); setEditing(true); } }}
      title={isOverride ? "Manual override — clear field to revert to auto-calculated" : "Auto-calculated — click to override"}
      className={`${cellBase} ${isOverride ? "text-foreground font-medium underline decoration-dotted decoration-primary/60 underline-offset-4 hover:bg-muted/50" : `${calcIdle} hover:bg-muted/50 cursor-text`}`}
    >
      {fmt(value)}
    </div>
  );
}

/* ── Bank/Account popover per row ── */
function BankPopover({
  bank, account, onChange,
}: {
  bank: string; account: string;
  onChange: (patch: { bank?: string; account?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [b, setB] = useState(bank);
  const [a, setA] = useState(account);
  const hasValue = !!(bank || account);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setB(bank); setA(account); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted/60 ${hasValue ? "text-primary" : "text-muted-foreground/60"}`}
          title={hasValue ? `${bank || "—"} · ${account || "—"}` : "Set bank & account"}
        >
          <Landmark className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="end">
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bank</Label>
            <Input value={b} onChange={e => setB(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Account</Label>
            <Input value={a} onChange={e => setA(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex justify-end gap-1 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => { onChange({ bank: b, account: a }); setOpen(false); }}>Save</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export function PayrollTab({ payroll, employees, shifts: _shifts, onSave, departments, onCreateEmployee, initialYear, initialMonth }: Props) {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(initialYear ?? now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(initialMonth ?? (now.getMonth() + 1));
  const [saving, setSaving] = useState(false);
  // edits keyed by `${year}-${month}:${employeeId}` so pending edits stay scoped to their period
  const [edits, setEdits] = useState<Record<string, Record<string, number | string | null>>>({});
  const [manuallyAdded, setManuallyAdded] = useState<Set<string>>(new Set());
  const editKey = (year: number, month: number, empId: string) => `${year}-${month}:${empId}`;
  const [importOpen, setImportOpen] = useState(false);

  const { venues } = useVenues();
  const venueById = useMemo(() => {
    const m = new Map<string, string>();
    venues.forEach(v => m.set(v.id, v.name));
    return m;
  }, [venues]);
  const venueOrder = useMemo(() => {
    const o = new Map<string, number>();
    venues.forEach((v, i) => o.set(v.name, i));
    return o;
  }, [venues]);
  const resolveVenue = useCallback((emp: HREmployee): string => {
    const vid = (emp as any).venue_id as string | null | undefined;
    if (vid && venueById.has(vid)) return venueById.get(vid)!;
    const legacy = (emp.venue || "").trim();
    if (legacy && venueOrder.has(legacy)) return legacy;
    return UNASSIGNED;
  }, [venueById, venueOrder]);
  const venueRank = useCallback((name: string): number => {
    if (name === UNASSIGNED) return Number.MAX_SAFE_INTEGER;
    return venueOrder.has(name) ? venueOrder.get(name)! : Number.MAX_SAFE_INTEGER - 1;
  }, [venueOrder]);

  const daysInMonth = new Date(filterYear, filterMonth, 0).getDate();

  const filtered = useMemo(
    () => payroll.filter(p => p.year === filterYear && p.month === filterMonth),
    [payroll, filterYear, filterMonth],
  );

  const periodPayrollEmpIds = useMemo(
    () => new Set(filtered.map(p => p.employee_id)),
    [filtered],
  );

  const isActiveStatus = (s: string) => ["active", "on_leave"].includes(s);

  const activeEmployees = useMemo(
    () => employees.filter(e =>
      isActiveStatus(e.status)
      || manuallyAdded.has(editKey(filterYear, filterMonth, e.id))
      || periodPayrollEmpIds.has(e.id)
    ).sort((a, b) => {
      const va = resolveVenue(a); const vb = resolveVenue(b);
      if (va !== vb) return venueRank(va) - venueRank(vb);
      return a.sort_order - b.sort_order;
    }),
    [employees, manuallyAdded, periodPayrollEmpIds, resolveVenue, venueRank, filterYear, filterMonth],
  );

  const payrollMap = useMemo(() => {
    const map: Record<string, HRPayroll> = {};
    filtered.forEach(p => { map[p.employee_id] = p; });
    return map;
  }, [filtered]);

  const venueGroups = useMemo(() => {
    const g: Record<string, HREmployee[]> = {};
    // seed insertion order following real venue order, then Unassigned last
    const buckets = new Map<string, HREmployee[]>();
    activeEmployees.forEach(emp => {
      const v = resolveVenue(emp);
      if (!buckets.has(v)) buckets.set(v, []);
      buckets.get(v)!.push(emp);
    });
    const keys = Array.from(buckets.keys()).sort((a, b) => venueRank(a) - venueRank(b));
    keys.forEach(k => { g[k] = buckets.get(k)!; });
    return g;
  }, [activeEmployees, resolveVenue, venueRank]);

  const setEdit = (empId: string, field: string, value: number | string | null) => {
    const k = editKey(filterYear, filterMonth, empId);
    setEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: value as any } }));
  };

  const getRowData = useCallback((emp: HREmployee) => {
    const p = payrollMap[emp.id];
    const e = edits[editKey(filterYear, filterMonth, emp.id)] || {};
    const baseSalary = e.forecast_base_salary != null ? Number(e.forecast_base_salary) : n(p?.forecast_base_salary);
    const daysHours = e.days_hours != null ? Number(e.days_hours) : (p ? n(p.forecast_allowances) || daysInMonth : daysInMonth);
    const isFT = emp.employment_type === "full_time";
    const computedEarned = isFT ? baseSalary : baseSalary * daysHours;
    const earnedOverride = e.earned_salary_override !== undefined
      ? (e.earned_salary_override === "" ? null : Number(e.earned_salary_override))
      : (p?.earned_salary_override ?? null);
    const earnedSalary = earnedOverride != null ? earnedOverride : computedEarned;

    // New: OT, Bonus, AL, NP are all $ amounts feeding Gross directly.
    // Adjustments is now a pure one-off residual — no more auto AL/NPL derivation.
    const overtime = e.actual_overtime != null ? Number(e.actual_overtime) : n((p as any)?.actual_overtime);
    const bonus = e.actual_bonus != null ? Number(e.actual_bonus) : n((p as any)?.actual_bonus);
    const alPay = e.annual_leave_pay != null ? Number(e.annual_leave_pay) : n(p?.annual_leave_pay);
    const npDed = e.unpaid_leave_deduction != null ? Number(e.unpaid_leave_deduction) : n(p?.unpaid_leave_deduction);
    const otherDed = e.other_deductions != null ? Number(e.other_deductions) : n((p as any)?.other_deductions);

    const adjOverride = e.adjustments_override !== undefined
      ? (e.adjustments_override === "" ? null : Number(e.adjustments_override))
      : (p?.adjustments_override ?? null);
    const adjustments = adjOverride != null ? adjOverride : 0;

    // Gross = Base(earned) + OT + Bonus + AL − NP + Adj
    const grossPay = earnedSalary + overtime + bonus + alPay - npDed + adjustments;
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
    // Net = Gross − MPF(EE) − Other Deductions
    const netPay = grossPay - mpfEE - otherDed;
    const bank = e.bank != null ? String(e.bank) : (p?.payment_method || "");
    const account = e.account != null ? String(e.account) : (p?.notes || "");
    const totalCost = grossPay + mpfER;
    return {
      baseSalary, daysHours, earnedSalary,
      overtime, bonus, alPay, npDed, otherDed,
      adjustments, grossPay, mpfEE, mpfER, totalMPF, netPay,
      bank, account, totalCost,
      payrollRecord: p, earnedOverride, adjOverride, mpfEEOverride, mpfEROverride,
    };
  }, [payrollMap, edits, daysInMonth, filterYear, filterMonth]);

  const saveRow = async (emp: HREmployee, silent?: boolean) => {
    const row = getRowData(emp);
    const p = row.payrollRecord;
    setSaving(true);
    const ok = await onSave({
      ...(p?.id ? { id: p.id } : {}),
      employee_id: emp.id, year: filterYear, month: filterMonth,
      forecast_base_salary: row.baseSalary, forecast_allowances: row.daysHours,
      actual_overtime: row.overtime,
      actual_bonus: row.bonus,
      annual_leave_pay: row.alPay,
      unpaid_leave_deduction: row.npDed,
      other_deductions: row.otherDed,
      gross_salary: row.grossPay, mpf_employee: row.mpfEE, mpf_employer: row.mpfER,
      mpf_payment_amount: row.totalMPF, net_salary: row.netPay, total_deductions: row.mpfEE + row.otherDed,
      payment_method: row.bank || "bank_transfer", notes: row.account,
      payment_status: p?.payment_status || "draft",
      earned_salary_override: row.earnedOverride,
      adjustments_override: row.adjOverride,
      mpf_employee_override: row.mpfEEOverride,
      mpf_employer_override: row.mpfEROverride,
    } as any);
    if (ok) {
      if (!silent) toast({ title: "Saved" });
      setEdits(prev => { const next = { ...prev }; delete next[editKey(filterYear, filterMonth, emp.id)]; return next; });
    }
    setSaving(false);
    return ok;
  };

  const prevMonth = () => { if (filterMonth === 1) { setFilterMonth(12); setFilterYear(y => y - 1); } else setFilterMonth(m => m - 1); };
  const nextMonth = () => { if (filterMonth === 12) { setFilterMonth(1); setFilterYear(y => y + 1); } else setFilterMonth(m => m + 1); };

  const venueSubtotals = useMemo(() => {
    const st: Record<string, {
      baseSalary: number; earnedSalary: number; overtime: number; bonus: number; alPay: number; npDed: number;
      otherDed: number; adjustments: number; grossPay: number; mpfEE: number; mpfER: number; totalMPF: number;
      netPay: number; totalCost: number;
    }> = {};
    Object.entries(venueGroups).forEach(([venue, emps]) => {
      const sub = { baseSalary: 0, earnedSalary: 0, overtime: 0, bonus: 0, alPay: 0, npDed: 0, otherDed: 0, adjustments: 0, grossPay: 0, mpfEE: 0, mpfER: 0, totalMPF: 0, netPay: 0, totalCost: 0 };
      emps.forEach(emp => {
        const r = getRowData(emp);
        sub.baseSalary += r.baseSalary; sub.earnedSalary += r.earnedSalary;
        sub.overtime += r.overtime; sub.bonus += r.bonus;
        sub.alPay += r.alPay; sub.npDed += r.npDed; sub.otherDed += r.otherDed;
        sub.adjustments += r.adjustments; sub.grossPay += r.grossPay;
        sub.mpfEE += r.mpfEE; sub.mpfER += r.mpfER; sub.totalMPF += r.totalMPF;
        sub.netPay += r.netPay; sub.totalCost += r.totalCost;
      });
      st[venue] = sub;
    });
    return st;
  }, [venueGroups, getRowData]);

  const grandTotal = useMemo(() => {
    const gt = { baseSalary: 0, earnedSalary: 0, overtime: 0, bonus: 0, alPay: 0, npDed: 0, otherDed: 0, adjustments: 0, grossPay: 0, mpfEE: 0, mpfER: 0, totalMPF: 0, netPay: 0, totalCost: 0, headcount: 0 };
    Object.values(venueSubtotals).forEach(sub => {
      gt.baseSalary += sub.baseSalary; gt.earnedSalary += sub.earnedSalary;
      gt.overtime += sub.overtime; gt.bonus += sub.bonus;
      gt.alPay += sub.alPay; gt.npDed += sub.npDed; gt.otherDed += sub.otherDed;
      gt.adjustments += sub.adjustments; gt.grossPay += sub.grossPay;
      gt.mpfEE += sub.mpfEE; gt.mpfER += sub.mpfER; gt.totalMPF += sub.totalMPF;
      gt.netPay += sub.netPay; gt.totalCost += sub.totalCost;
    });
    activeEmployees.forEach(emp => { const r = getRowData(emp); if (r.baseSalary > 0) gt.headcount++; });
    return gt;
  }, [venueSubtotals, activeEmployees, getRowData]);


  const payStatus = useMemo(() => {
    const s = filtered.map(p => p.payment_status);
    return s.length > 0 && s.every(x => x === "paid") ? "Paid" : "Pending";
  }, [filtered]);

  const avgSalary = grandTotal.headcount > 0 ? grandTotal.grossPay / grandTotal.headcount : 0;
  const periodPrefix = `${filterYear}-${filterMonth}:`;
  const hasAnyEdits = useMemo(
    () => Object.keys(edits).some(k => k.startsWith(periodPrefix)),
    [edits, periodPrefix],
  );

  const saveAll = async () => {
    const empIds = Object.keys(edits)
      .filter(k => k.startsWith(periodPrefix))
      .map(k => k.slice(periodPrefix.length));
    let succeeded = 0;
    let failed = 0;
    for (const empId of empIds) {
      const emp = employees.find(e => e.id === empId);
      if (!emp) {
        failed++;
        continue;
      }
      const ok = await saveRow(emp, true);
      if (ok) succeeded++;
      else failed++;
    }
    if (failed === 0) {
      toast({ title: `Saved ${succeeded} ${succeeded === 1 ? "record" : "records"}` });
    } else {
      toast({
        title: `Saved ${succeeded} of ${succeeded + failed} records — ${failed} failed`,
        variant: "destructive",
      });
    }
  };

  const [posting, setPosting] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { batches, lines: batchLines, reload: reloadBatches, voidBatch } = usePayrollPaymentBatches(filterYear, filterMonth);

  const accrualPosted = useMemo(
    () => filtered.some((p) => p.accrual_journal_entry_id),
    [filtered],
  );

  const postAccrual = async (rebuild = false) => {
    if (hasAnyEdits) {
      toast({ title: "Save changes first", description: "You have unsaved edits.", variant: "destructive" });
      return;
    }
    setPosting(true);
    const fn = rebuild ? "rebuild_payroll_accrual" : "post_payroll_accrual";
    const { data, error } = await (supabase as any).rpc(fn, { p_year: filterYear, p_month: filterMonth });
    setPosting(false);
    if (error) { toast({ title: "Post failed", description: error.message, variant: "destructive" }); return; }
    if ((data as any)?.already_posted) {
      toast({ title: "Already posted", description: `${MONTHS[filterMonth - 1]} ${filterYear} payroll accrual is already in the ledger.` });
    } else {
      toast({ title: "Accrual posted", description: `${(data as any)?.entries_created ?? 0} journal entries created. Flowed to Trial Balance, P&L & Balance Sheet.` });
    }
    window.dispatchEvent(new Event("hr-data-refresh"));
  };

  const applyImport = (imported: PayrollImportApplyPayload[]) => {
    if (imported.length === 0) return;
    // Every row carries its own year/month from the dialog; scope edits to that period, not the currently-viewed one.
    setEdits(prev => {
      const next = { ...prev };
      for (const row of imported) {
        // New composition. Gross = Base + OT + Bonus + AL − NP + Adj; Net = Gross − MPF(EE) − Other Ded.
        // Solve for Adj such that Net matches the scanned figure — any remaining gap goes into Adjustments.
        const expectedNet =
          row.base_salary + row.overtime_pay + row.actual_bonus + row.annual_leave_pay -
          row.unpaid_leave_deduction - row.mpf_employee - (row.other_deductions || 0);
        const adjustment = row.net_pay > 0 ? row.net_pay - expectedNet : 0;
        const k = editKey(row.year, row.month, row.employee_id);
        next[k] = {
          ...next[k],
          forecast_base_salary: row.base_salary,
          earned_salary_override: row.base_salary,
          actual_overtime: row.overtime_pay,
          actual_bonus: row.actual_bonus,
          annual_leave_pay: row.annual_leave_pay,
          unpaid_leave_deduction: row.unpaid_leave_deduction,
          other_deductions: row.other_deductions || 0,
          adjustments_override: Number(adjustment.toFixed(2)),
          mpf_employee_override: row.mpf_employee,
          mpf_employer_override: row.mpf_employer,
        };
      }
      return next;
    });
    setManuallyAdded(prev => {
      const next = new Set(prev);
      for (const row of imported) next.add(editKey(row.year, row.month, row.employee_id));
      return next;
    });
    // Navigate the table to the imported period so the user sees what they just applied.
    const first = imported[0];
    if (first.year !== filterYear || first.month !== filterMonth) {
      setFilterYear(first.year);
      setFilterMonth(first.month);
    }
  };


  const currentEmployeeIds = useMemo(() => new Set(activeEmployees.map(e => e.id)), [activeEmployees]);

  /* ── Column cluster boundaries ─────────────────────────
     Cluster 1: No, Name, Dept/Venue, Position, Type  (indices 0-4)
     Cluster 2: Basic, Days/Hrs, Earned, AL, NPL, Adj, Gross (5-11)
     Cluster 3: MPF EE, MPF ER, Total MPF (12-14)
     Cluster 4: Net Pay, Total Cost (15-16)
     Cluster 5: Bank chip (17)
  ─────────────────────────────────────────────────────── */
  const clusterEnd = "border-r border-border";       // divider between clusters
  const rowBorder = "border-b border-border/40";      // hairline row separator
  const stickyCol0 = "sticky left-0 z-[1] bg-background";
  const stickyCol1 = "sticky left-[42px] z-[1] bg-background";
  const stickyColH0 = "sticky left-0 z-[2] bg-background";
  const stickyColH1 = "sticky left-[42px] z-[2] bg-background";

  return (
    <div className="space-y-6">
      {/* ── Period nav + actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Period</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-base font-display font-semibold min-w-[160px] text-center">{MONTHS[filterMonth - 1]} {filterYear}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-7 text-xs gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Import / Scan
          </Button>
          {hasAnyEdits && (
            <Button size="sm" onClick={saveAll} disabled={saving} className="h-7 text-xs gap-1">
              <Save className="h-3.5 w-3.5" /> Save All Changes
            </Button>
          )}
          {accrualPosted ? (
            <Button size="sm" variant="outline" onClick={() => postAccrual(true)} disabled={posting || hasAnyEdits} className="h-7 text-xs gap-1" title="Void existing accrual & re-post">
              <RotateCcw className="h-3.5 w-3.5" /> {posting ? "…" : "Rebuild Accrual"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => postAccrual(false)} disabled={posting || hasAnyEdits} className="h-7 text-xs gap-1" title="Post month-end payroll accrual journal">
              <BookOpen className="h-3.5 w-3.5" /> {posting ? "Posting…" : "Post Accrual"}
            </Button>
          )}
          <Button size="sm" onClick={() => setPaymentOpen(true)} disabled={!accrualPosted || hasAnyEdits} className="h-7 text-xs gap-1" title={accrualPosted ? "Settle salary or MPF" : "Post accrual first"}>
            <Banknote className="h-3.5 w-3.5" /> Record Payment
          </Button>
          {accrualPosted && (
            <a
              href={`/finance/journal?source=payroll_accrual&period=${filterYear}-${String(filterMonth).padStart(2, "0")}`}
              className="inline-flex items-center gap-1 rounded border border-primary/30 px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
              title="View accrual entries in the general journal"
            >
              <BookOpen className="h-3 w-3" /> View accrual JE
            </a>
          )}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-glass rounded-xl p-4">
          <SectionLabel>Payroll Summary</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Stat label="Headcount" value={String(grandTotal.headcount)} />
            <Stat label="Avg salary" value={`HK$ ${fmt(avgSalary)}`} />
            <Stat label="MPF rate" value={`${(MPF_RATE * 100).toFixed(0)}%`} />
            <Stat label="Days in month" value={String(daysInMonth)} />
            <Stat label="Total gross" value={`HK$ ${fmt(grandTotal.grossPay)}`} strong />
            <Stat label="Total net" value={`HK$ ${fmt(grandTotal.netPay)}`} strong />
            <Stat label="Total MPF (ER)" value={`HK$ ${fmt(grandTotal.mpfER)}`} />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</div>
              <Badge variant={payStatus === "Paid" ? "default" : "outline"} className="text-[10px] mt-1">{payStatus}</Badge>
            </div>
          </div>
        </div>
        <div className="card-glass rounded-xl p-4">
          <SectionLabel>MPF & Venue Breakdown</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Stat label="MPF cap" value={`HK$ ${fmt(MPF_CAP)}`} />
            <Stat label="Total MPF (EE)" value={`HK$ ${fmt(grandTotal.mpfEE)}`} />
            <Stat label="Total MPF (ER)" value={`HK$ ${fmt(grandTotal.mpfER)}`} />
            <Stat label="Total cost" value={`HK$ ${fmt(grandTotal.totalCost)}`} strong />
          </div>
          {Object.keys(venueSubtotals).length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              {Object.entries(venueSubtotals).map(([venue, sub]) => (
                <Stat key={venue} label={venue} value={`HK$ ${fmt(sub.grossPay)}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <PayrollLaborCostCard year={filterYear} month={filterMonth} />

      {/* ── Mobile card list ── */}
      <div className="sm:hidden space-y-4">
        <SectionLabel>Employee Payroll</SectionLabel>
        <div className="space-y-2">
          {activeEmployees.map((emp) => {
            const r = getRowData(emp);
            return (
              <Link
                key={emp.id}
                to={`/hr/employees/${emp.id}`}
                className="block rounded-lg border border-border/60 bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{emp.last_name}, {emp.first_name}</span>
                      {!isActiveStatus(emp.status) && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground font-normal">inactive</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{resolveVenue(emp)} · {emp.job_title || "—"}</div>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <div className="font-semibold">HK$ {fmt(r.netPay)}</div>
                    <div className="text-[10px] text-muted-foreground">Net pay</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <div><div>Gross</div><div className="text-foreground tabular-nums">{fmt(r.grossPay)}</div></div>
                  <div><div>MPF (EE)</div><div className="text-foreground tabular-nums">{fmt(r.mpfEE)}</div></div>
                  <div><div>Total cost</div><div className="text-foreground tabular-nums">{fmt(r.totalCost)}</div></div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Employee Payroll Table (sm+) ── */}
      <div className="hidden sm:block">
        <SectionLabel>Employee Payroll</SectionLabel>
        <div className="rounded-xl border border-border overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-[3] bg-background">
                <tr className="border-b border-border">
                  <Th className={`${stickyColH0} w-[42px] text-center`}>#</Th>
                  <Th className={`${stickyColH1} min-w-[160px] text-left`}>Employee</Th>
                  <Th className="min-w-[100px] text-left">Dept · Venue</Th>
                  <Th className="min-w-[110px] text-left">Position</Th>
                  <Th className={`w-[52px] text-center ${clusterEnd}`}>Type</Th>

                  <Th className="min-w-[90px] text-right">Basic</Th>
                  <Th className="w-[72px] text-right">Days/Hrs</Th>
                  <Th className="min-w-[92px] text-right">Earned</Th>
                  <Th className="w-[70px] text-right">OT</Th>
                  <Th className="w-[76px] text-right">Bonus</Th>
                  <Th className="w-[66px] text-right">AL/PH</Th>
                  <Th className="w-[66px] text-right">NP</Th>
                  <Th className="min-w-[86px] text-right">Adj</Th>
                  <Th className={`min-w-[96px] text-right ${clusterEnd}`}>Gross</Th>

                  <Th className="min-w-[82px] text-right">Other Ded.</Th>
                  <Th className="min-w-[80px] text-right">MPF EE</Th>
                  <Th className="min-w-[80px] text-right">MPF ER</Th>
                  <Th className={`min-w-[84px] text-right ${clusterEnd}`}>Total MPF</Th>

                  <Th className="min-w-[96px] text-right">Net Pay</Th>
                  <Th className={`min-w-[96px] text-right ${clusterEnd}`}>Total Cost</Th>

                  <Th className="w-[38px] text-center"><span className="sr-only">Bank</span></Th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let rowNum = 0;
                  return Object.entries(venueGroups).map(([venue, emps]) => {
                    const startNum = rowNum;
                    rowNum += emps.length;
                    return (
                      <VenueGroup
                        key={venue}
                        venue={venue}
                        emps={emps}
                        startNum={startNum}
                        getRowData={getRowData}
                        setEdit={setEdit}
                        hasEditFor={(empId: string) => !!edits[editKey(filterYear, filterMonth, empId)]}
                        subtotal={venueSubtotals[venue]}
                        stickyCol0={stickyCol0}
                        stickyCol1={stickyCol1}
                        clusterEnd={clusterEnd}
                        rowBorder={rowBorder}
                      />
                    );
                  });
                })()}

                {/* Add-employee row */}
                <tr>
                  <td colSpan={21} className="px-2 py-3">
                    <AddEmployeeRow
                      employees={employees}
                      excludeIds={currentEmployeeIds}
                      onAdd={(id) => setManuallyAdded(prev => { const next = new Set(prev); next.add(id); return next; })}
                    />
                  </td>
                </tr>

                {/* Grand total */}
                <tr className="bg-primary/5 border-t-2 border-primary/30">
                  <td className={`${stickyCol0} bg-primary/5 px-2 py-2`} />
                  <td colSpan={4} className={`px-2 py-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-foreground ${clusterEnd}`}>Grand Total</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.baseSalary)}</td>
                  <td />
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.earnedSalary)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.overtime)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.bonus)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.alPay)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.npDed)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.adjustments)}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${clusterEnd}`}>{fmt(grandTotal.grossPay)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.otherDed)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.mpfEE)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.mpfER)}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${clusterEnd}`}>{fmt(grandTotal.totalMPF)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(grandTotal.netPay)}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${clusterEnd}`}>{fmt(grandTotal.totalCost)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Payment Batches panel ── */}
      {batches.length > 0 && (
        <div>
          <SectionLabel>Payment Batches — {MONTHS[filterMonth - 1]} {filterYear}</SectionLabel>
          <div className="rounded-xl border border-border overflow-hidden bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Kind</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-center">Employees</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Bank txn</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const lc = batchLines.filter((l) => l.batch_id === b.id).length;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">{b.payment_date}</TableCell>
                      <TableCell className="text-xs uppercase">{b.payment_kind}</TableCell>
                      <TableCell className="text-xs">{b.payment_method}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">{fmt(Number(b.total_amount))}</TableCell>
                      <TableCell className="text-xs text-center">{lc}</TableCell>
                      <TableCell><Badge variant={b.status === "posted" ? "default" : b.status === "void" ? "outline" : "secondary"} className="text-[10px]">{b.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.bank_transaction_id ? "matched" : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {b.journal_entry_id && (
                            <a
                              href={`/finance/journal?entry=${b.journal_entry_id}`}
                              className="text-[10px] text-primary hover:underline"
                              title="View journal entry"
                            >
                              JE
                            </a>
                          )}
                          {b.status === "posted" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => voidBatch(b.id)}>
                              <X className="h-3 w-3 mr-1" /> Void
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <PayrollPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        year={filterYear}
        month={filterMonth}
        payroll={filtered}
        employees={employees}
        onPosted={() => { reloadBatches(); window.dispatchEvent(new Event("hr-data-refresh")); }}
      />

      <PayrollImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        employees={employees}
        departments={departments}
        venues={venues}
        onCreateEmployee={onCreateEmployee}
        onApply={applyImport}
        targetYear={filterYear}
        targetMonth={filterMonth}
      />

      {/* Bank/account are editable per row via the Landmark icon on the far right of each row. */}
      {/* Row hover reveals subtle affordance; override values are underlined with a dotted primary rule. */}
    </div>
  );
}

/* ── Helper subcomponents ─────────────────────────────── */

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground px-2 py-2 whitespace-nowrap border-b border-border ${className}`}>
      {children}
    </th>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className={`tabular-nums truncate ${strong ? "text-base font-semibold text-foreground" : "text-sm font-medium text-foreground"}`}>{value}</div>
    </div>
  );
}

function VenueGroup({
  venue, emps, startNum, getRowData, setEdit, hasEditFor, subtotal,
  stickyCol0, stickyCol1, clusterEnd, rowBorder,
}: any) {
  return (
    <>
      {/* Slim venue header row */}
      <tr>
        <td colSpan={21} className="px-2 pt-4 pb-1 border-b border-border/40">
          <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">{venue}</span>
        </td>
      </tr>
      {emps.map((emp: HREmployee, i: number) => {
        const rowNum = startNum + i + 1;
        const row = getRowData(emp);
        const hasEdits = hasEditFor(emp.id);
        const type = emp.employment_type === "full_time" ? "FT" : emp.employment_type === "part_time" ? "PT" : "C";
        const rowBg = hasEdits ? "bg-primary/[0.04]" : "";
        return (
          <tr key={emp.id} className={`group ${rowBorder} hover:bg-muted/30 ${rowBg}`}>
            <td className={`${stickyCol0} ${rowBg || "bg-background group-hover:bg-muted/30"} px-2 py-2 text-center text-muted-foreground text-[11px]`}>{rowNum}</td>
            <td className={`${stickyCol1} ${rowBg || "bg-background group-hover:bg-muted/30"} px-2 py-2 font-medium whitespace-nowrap`}>
              <Link to={`/hr/employees/${emp.id}`} className="hover:text-primary hover:underline">
                {emp.last_name}, {emp.first_name}
              </Link>
              {!["active", "on_leave"].includes(emp.status) && (
                <span className="ml-1.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground font-normal align-middle">inactive</span>
              )}
            </td>
            <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{venue}</td>
            <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{emp.job_title || "—"}</td>
            <td className={`px-2 py-2 text-center text-[11px] font-medium ${clusterEnd}`}>{type}</td>

            <td className="px-1 py-1"><ECell value={row.baseSalary} onChange={v => setEdit(emp.id, "forecast_base_salary", v)} /></td>
            <td className="px-1 py-1"><ECell value={row.daysHours} onChange={v => setEdit(emp.id, "days_hours", v)} /></td>
            <td className="px-1 py-1"><OCell value={row.earnedSalary} isOverride={row.earnedOverride != null} onChange={v => setEdit(emp.id, "earned_salary_override", v)} /></td>
            <td className="px-1 py-1"><ECell value={row.overtime} onChange={v => setEdit(emp.id, "actual_overtime", v)} /></td>
            <td className="px-1 py-1"><ECell value={row.bonus} onChange={v => setEdit(emp.id, "actual_bonus", v)} /></td>
            <td className="px-1 py-1"><ECell value={row.alPay} onChange={v => setEdit(emp.id, "annual_leave_pay", v)} /></td>
            <td className="px-1 py-1"><ECell value={row.npDed} onChange={v => setEdit(emp.id, "unpaid_leave_deduction", v)} /></td>
            <td className="px-1 py-1"><OCell value={row.adjustments} isOverride={row.adjOverride != null} onChange={v => setEdit(emp.id, "adjustments_override", v)} /></td>
            <td className={`px-1 py-1 ${clusterEnd}`}><SCell value={row.grossPay} bold /></td>

            <td className="px-1 py-1"><ECell value={row.otherDed} onChange={v => setEdit(emp.id, "other_deductions", v)} /></td>
            <td className="px-1 py-1"><OCell value={row.mpfEE} isOverride={row.mpfEEOverride != null} onChange={v => setEdit(emp.id, "mpf_employee_override", v)} /></td>
            <td className="px-1 py-1"><OCell value={row.mpfER} isOverride={row.mpfEROverride != null} onChange={v => setEdit(emp.id, "mpf_employer_override", v)} /></td>
            <td className={`px-1 py-1 ${clusterEnd}`}><SCell value={row.totalMPF} /></td>

            <td className="px-1 py-1"><SCell value={row.netPay} bold /></td>
            <td className={`px-1 py-1 ${clusterEnd}`}><SCell value={row.totalCost} bold /></td>

            <td className="px-1 py-1 text-center">
              <BankPopover
                bank={row.bank}
                account={row.account}
                onChange={(patch) => {
                  if (patch.bank !== undefined) setEdit(emp.id, "bank", patch.bank);
                  if (patch.account !== undefined) setEdit(emp.id, "account", patch.account);
                }}
              />
            </td>
          </tr>
        );
      })}
      {/* Venue subtotal */}
      <tr className="bg-muted/40 border-t border-border/60">
        <td className={`${stickyCol0} bg-muted/40 px-2 py-2`} />
        <td colSpan={4} className={`px-2 py-2 text-[11px] uppercase tracking-[0.1em] font-semibold text-muted-foreground ${clusterEnd}`}>{venue} subtotal</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.baseSalary || 0)}</td>
        <td />
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.earnedSalary || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.overtime || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.bonus || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.alPay || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.npDed || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.adjustments || 0)}</td>
        <td className={`px-2 py-2 text-right font-semibold tabular-nums ${clusterEnd}`}>{fmt(subtotal?.grossPay || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.otherDed || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.mpfEE || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.mpfER || 0)}</td>
        <td className={`px-2 py-2 text-right font-semibold tabular-nums ${clusterEnd}`}>{fmt(subtotal?.totalMPF || 0)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmt(subtotal?.netPay || 0)}</td>
        <td className={`px-2 py-2 text-right font-semibold tabular-nums ${clusterEnd}`}>{fmt(subtotal?.totalCost || 0)}</td>
        <td />
      </tr>
      
    </>
  );
}

function AddEmployeeRow({
  employees, excludeIds, onAdd,
}: {
  employees: HREmployee[];
  excludeIds: Set<string>;
  onAdd: (id: string) => void;
}) {
  const [pending, setPending] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Add employee to run</span>
      <div className="w-[280px]">
        <EmployeePicker
          employees={employees}
          value={pending}
          onChange={(id) => { onAdd(id); setPending(""); }}
          excludeIds={excludeIds}
          placeholder="Search employee…"
        />
      </div>
    </div>
  );
}
