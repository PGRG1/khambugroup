import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Check, X, Calendar, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRLeaveRequest, HRLeaveType, HRLeaveBalance, HREmployee } from "@/hooks/useHRData";

interface Props {
  leaveRequests: HRLeaveRequest[];
  leaveTypes: HRLeaveType[];
  leaveBalances: HRLeaveBalance[];
  employees: HREmployee[];
  onSaveRequest: (r: Partial<HRLeaveRequest>) => Promise<boolean>;
  onSaveType: (t: Partial<HRLeaveType>) => Promise<boolean>;
  onSaveBalance: (b: Partial<HRLeaveBalance>) => Promise<boolean>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

// Short code for leave type display
function leaveCode(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("STATUTORY") || upper.includes("SH")) return "SH";
  if (upper.includes("ANNUAL") || upper.includes("AL")) return "AL";
  if (upper.includes("IOU")) return "IOU";
  if (upper.includes("SICK")) return "SL";
  if (upper.includes("UNPAID") || upper.includes("NPL")) return "NPL";
  return name.slice(0, 3).toUpperCase();
}

export function LeaveManagementTab({ leaveRequests, leaveTypes, leaveBalances, employees, onSaveRequest, onSaveType, onSaveBalance }: Props) {
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [balModalOpen, setBalModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Partial<HRLeaveRequest> | null>(null);
  const [editingType, setEditingType] = useState<Partial<HRLeaveType> | null>(null);
  const [editingBal, setEditingBal] = useState<Partial<HRLeaveBalance> | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterVenue, setFilterVenue] = useState<string>("all");

  const activeEmployees = employees.filter(e => e.status === "active");
  const venues = useMemo(() => [...new Set(activeEmployees.map(e => e.venue).filter(Boolean))].sort(), [activeEmployees]);

  // Current year balances
  const yearBalances = useMemo(() => leaveBalances.filter(b => b.year === selectedYear), [leaveBalances, selectedYear]);

  // Year requests
  const yearRequests = useMemo(() => {
    const yearStr = String(selectedYear);
    return leaveRequests.filter(r => r.start_date.startsWith(yearStr));
  }, [leaveRequests, selectedYear]);

  const approvedRequests = useMemo(() => yearRequests.filter(r => r.status === "approved"), [yearRequests]);
  const pendingRequests = useMemo(() => yearRequests.filter(r => r.status === "pending"), [yearRequests]);

  // Active leave types sorted
  const activeLeaveTypes = useMemo(() => leaveTypes.filter(t => t.is_active), [leaveTypes]);

  // KPI stats
  const kpiStats = useMemo(() => {
    const totalEntitlement = yearBalances.reduce((s, b) => s + b.total_days, 0);
    const totalUsed = yearBalances.reduce((s, b) => s + b.used_days, 0);
    const totalRemaining = yearBalances.reduce((s, b) => s + b.remaining_days, 0);
    const totalAccrued = yearBalances.reduce((s, b) => s + (b as any).adjustments + b.total_days, 0);
    const lowBalanceCount = activeEmployees.filter(emp => {
      const empBals = yearBalances.filter(b => b.employee_id === emp.id);
      return empBals.some(b => b.remaining_days <= 2 && b.total_days > 0);
    }).length;
    return { totalEntitlement, totalUsed, totalRemaining, lowBalanceCount, pendingCount: pendingRequests.length };
  }, [yearBalances, activeEmployees, pendingRequests]);

  // Filtered employees for the balance table
  const filteredEmployees = useMemo(() => {
    let list = activeEmployees;
    if (filterVenue !== "all") list = list.filter(e => e.venue === filterVenue);
    if (filterEmployee !== "all") list = list.filter(e => e.id === filterEmployee);
    return list;
  }, [activeEmployees, filterVenue, filterEmployee]);

  // Build balance rows: one row per employee, columns per leave type
  const balanceRows = useMemo(() => {
    return filteredEmployees.map(emp => {
      const empBals = yearBalances.filter(b => b.employee_id === emp.id);
      const byType: Record<string, {
        balance: HRLeaveBalance | null;
        startingBal: number;
        accrued: number;
        used: number;
        currentBal: number;
      }> = {};

      activeLeaveTypes.forEach(lt => {
        const bal = empBals.find(b => b.leave_type_id === lt.id);
        if (bal) {
          // carried_forward = starting balance from previous year
          // adjustments = accruals during the year (SH added, etc.)
          // total_days = base entitlement for the year
          // used_days = deductions (leave taken)
          // remaining_days = what's left
          const carried = (bal as any).carried_forward || 0;
          const baseEntitlement = bal.total_days;
          const adjustments = (bal as any).adjustments || 0;
          const startingBal = carried + baseEntitlement;
          const accrued = adjustments;
          const used = bal.used_days;
          const currentBal = startingBal + accrued - used;
          byType[lt.id] = { balance: bal, startingBal, accrued, used, currentBal };
        } else {
          byType[lt.id] = { balance: null, startingBal: 0, accrued: 0, used: 0, currentBal: 0 };
        }
      });

      const totalStarting = Object.values(byType).reduce((s, v) => s + v.startingBal, 0);
      const totalAccrued = Object.values(byType).reduce((s, v) => s + v.accrued, 0);
      const totalUsed = Object.values(byType).reduce((s, v) => s + v.used, 0);
      const totalCurrent = Object.values(byType).reduce((s, v) => s + v.currentBal, 0);

      return { employee: emp, byType, totalStarting, totalAccrued, totalUsed, totalCurrent };
    });
  }, [filteredEmployees, yearBalances, activeLeaveTypes]);

  const handleApprove = async (req: HRLeaveRequest, status: "approved" | "rejected") => {
    const ok = await onSaveRequest({ id: req.id, status });
    if (ok) toast({ title: `Leave ${status}` });
  };

  const handleSaveReq = async () => {
    if (!editingReq?.employee_id || !editingReq?.leave_type_id || !editingReq?.start_date || !editingReq?.end_date) return;
    setSaving(true);
    const ok = await onSaveRequest(editingReq);
    if (ok) { toast({ title: "Saved" }); setReqModalOpen(false); }
    setSaving(false);
  };

  const handleSaveType = async () => {
    if (!editingType?.name) return;
    setSaving(true);
    const ok = await onSaveType(editingType);
    if (ok) { toast({ title: "Saved" }); setTypeModalOpen(false); }
    setSaving(false);
  };

  const handleSaveBal = async () => {
    if (!editingBal?.employee_id || !editingBal?.leave_type_id) return;
    setSaving(true);
    // Auto-calculate remaining
    const carried = (editingBal as any).carried_forward || 0;
    const base = editingBal.total_days || 0;
    const adj = (editingBal as any).adjustments || 0;
    const used = editingBal.used_days || 0;
    const remaining = carried + base + adj - used;
    const ok = await onSaveBalance({ ...editingBal, remaining_days: remaining });
    if (ok) { toast({ title: "Saved" }); setBalModalOpen(false); }
    setSaving(false);
  };

  const updateReqDays = (req: Partial<HRLeaveRequest>) => {
    if (req.start_date && req.end_date) {
      const start = new Date(req.start_date);
      const end = new Date(req.end_date);
      const diffMs = end.getTime() - start.getTime();
      const days = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
      return { ...req, days };
    }
    return req;
  };

  const years = [selectedYear - 1, selectedYear, selectedYear + 1];

  const n = (v: number) => v === 0 ? "—" : v.toFixed(v % 1 === 0 ? 0 : 1);

  return (
    <div className="space-y-6">
      {/* Year selector + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  selectedYear === y
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditingType({ name: "", default_days_per_year: 0, is_paid: true, is_active: true }); setTypeModalOpen(true); }}>
            Leave Types
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            setEditingBal({ year: selectedYear, total_days: 0, used_days: 0, remaining_days: 0, carried_forward: 0, adjustments: 0, adjustment_notes: "" } as any);
            setBalModalOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-1" /> Set Balance
          </Button>
          <Button size="sm" onClick={() => { setEditingReq({ status: "pending", days: 1 }); setReqModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Leave Request
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterVenue} onValueChange={setFilterVenue}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Venues" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Venues</SelectItem>
                {venues.map(v => <SelectItem key={v} value={v!}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {activeEmployees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground ml-auto">{filteredEmployees.length} employees</p>
          </div>

          {activeLeaveTypes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No leave types configured. Add leave types first (e.g. SH, AL, IOU).</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border border-border rounded-lg overflow-auto">
              <table className="w-full text-[11px]">
                <thead>
                  {/* Group headers */}
                  <tr className="border-b border-border bg-muted/60">
                    <th rowSpan={2} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider border-r border-border sticky left-0 bg-muted/60 min-w-[40px]">#</th>
                    <th rowSpan={2} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider border-r border-border sticky left-[40px] bg-muted/60 min-w-[140px]">Employee</th>
                    <th rowSpan={2} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider border-r border-border min-w-[80px]">Venue</th>
                    {activeLeaveTypes.map(lt => (
                      <th key={lt.id} colSpan={4} className="px-2 py-1.5 text-center font-bold text-[10px] uppercase tracking-wider border-r border-border bg-muted/40">
                        <span className="text-primary">{leaveCode(lt.name)}</span>
                        <span className="text-muted-foreground font-normal ml-1">({lt.name})</span>
                      </th>
                    ))}
                    <th colSpan={4} className="px-2 py-1.5 text-center font-bold text-[10px] uppercase tracking-wider bg-muted/70">
                      TOTAL
                    </th>
                  </tr>
                  {/* Sub headers */}
                  <tr className="border-b border-border bg-muted/40">
                    {activeLeaveTypes.map(lt => (
                      <SubHeaders key={lt.id} />
                    ))}
                    <SubHeaders />
                  </tr>
                </thead>
                <tbody>
                  {balanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={3 + activeLeaveTypes.length * 4 + 4} className="text-center text-muted-foreground py-8">
                        <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        No employees match filter
                      </td>
                    </tr>
                  ) : (
                    <>
                      {balanceRows.map((row, idx) => {
                        const emp = row.employee;
                        return (
                          <tr key={emp.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 text-center text-muted-foreground border-r border-border/40 sticky left-0 bg-card">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium border-r border-border/40 sticky left-[40px] bg-card">
                              {emp.first_name} {emp.last_name}
                              {emp.job_title && <span className="block text-[9px] text-muted-foreground font-normal">{emp.job_title}</span>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground border-r border-border/40">{emp.venue || "—"}</td>
                            {activeLeaveTypes.map(lt => {
                              const data = row.byType[lt.id];
                              const hasBal = !!data.balance;
                              return (
                                <BalanceCells
                                  key={lt.id}
                                  startingBal={data.startingBal}
                                  accrued={data.accrued}
                                  used={data.used}
                                  currentBal={data.currentBal}
                                  hasBal={hasBal}
                                  onClick={() => {
                                    if (data.balance) {
                                      setEditingBal({ ...data.balance });
                                    } else {
                                      setEditingBal({
                                        employee_id: emp.id,
                                        leave_type_id: lt.id,
                                        year: selectedYear,
                                        total_days: lt.default_days_per_year,
                                        used_days: 0,
                                        remaining_days: lt.default_days_per_year,
                                        carried_forward: 0,
                                        adjustments: 0,
                                        adjustment_notes: "",
                                      } as any);
                                    }
                                    setBalModalOpen(true);
                                  }}
                                  n={n}
                                />
                              );
                            })}
                            {/* Totals */}
                            <td className="px-2 py-2 text-right tabular-nums font-medium bg-muted/20">{n(row.totalStarting)}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-medium text-primary bg-muted/20">{row.totalAccrued > 0 ? `+${n(row.totalAccrued)}` : n(row.totalAccrued)}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-medium text-destructive bg-muted/20">{row.totalUsed > 0 ? `-${n(row.totalUsed)}` : n(row.totalUsed)}</td>
                            <td className={`px-2 py-2 text-right tabular-nums font-bold bg-muted/20 ${row.totalCurrent <= 2 && row.totalStarting > 0 ? "text-destructive" : ""}`}>
                              {n(row.totalCurrent)}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Grand total row */}
                      <tr className="bg-muted/50 font-bold border-t-2 border-border">
                        <td colSpan={3} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider sticky left-0 bg-muted/50">Grand Total</td>
                        {activeLeaveTypes.map(lt => {
                          const totals = balanceRows.reduce((acc, r) => {
                            const d = r.byType[lt.id];
                            return {
                              starting: acc.starting + d.startingBal,
                              accrued: acc.accrued + d.accrued,
                              used: acc.used + d.used,
                              current: acc.current + d.currentBal,
                            };
                          }, { starting: 0, accrued: 0, used: 0, current: 0 });
                          return (
                            <GrandTotalCells key={lt.id} {...totals} n={n} />
                          );
                        })}
                        <td className="px-2 py-2 text-right tabular-nums bg-muted/40">{n(balanceRows.reduce((s, r) => s + r.totalStarting, 0))}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-primary bg-muted/40">+{n(balanceRows.reduce((s, r) => s + r.totalAccrued, 0))}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-destructive bg-muted/40">-{n(balanceRows.reduce((s, r) => s + r.totalUsed, 0))}</td>
                        <td className="px-2 py-2 text-right tabular-nums bg-muted/40">{n(balanceRows.reduce((s, r) => s + r.totalCurrent, 0))}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 text-[10px] text-muted-foreground flex-wrap">
            <span><span className="font-medium text-foreground">Starting</span> = Carried Forward + Base Entitlement</span>
            <span><span className="font-medium text-primary">Accrued</span> = Adjustments (SH added, bonus days)</span>
            <span><span className="font-medium text-destructive">Used</span> = Leave days taken</span>
            <span><span className="font-bold text-foreground">Balance</span> = Starting + Accrued − Used</span>
            <span className="italic">Click any cell to edit</span>
          </div>

      {/* Leave Request Modal */}
      <Dialog open={reqModalOpen} onOpenChange={setReqModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingReq?.id ? "Edit Leave Request" : "New Leave Request"}</DialogTitle></DialogHeader>
          {editingReq && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                <Select value={editingReq.employee_id || ""} onValueChange={v => setEditingReq(p => p ? { ...p, employee_id: v } : p)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Leave Type *</label>
                <Select value={editingReq.leave_type_id || ""} onValueChange={v => setEditingReq(p => p ? { ...p, leave_type_id: v } : p)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{activeLeaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{leaveCode(t.name)} — {t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label>
                  <Input type="date" value={editingReq.start_date || ""} onChange={e => {
                    const updated = { ...editingReq, start_date: e.target.value };
                    setEditingReq(updateReqDays(updated));
                  }} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
                  <Input type="date" value={editingReq.end_date || ""} onChange={e => {
                    const updated = { ...editingReq, end_date: e.target.value };
                    setEditingReq(updateReqDays(updated));
                  }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Days</label>
                  <Input type="number" value={editingReq.days || 1} onChange={e => setEditingReq(p => p ? { ...p, days: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editingReq.status || "pending"} onValueChange={v => setEditingReq(p => p ? { ...p, status: v } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
                <Input value={editingReq.reason || ""} onChange={e => setEditingReq(p => p ? { ...p, reason: e.target.value } : p)} />
              </div>
              {/* Balance context */}
              {editingReq.employee_id && editingReq.leave_type_id && (() => {
                const bal = yearBalances.find(b => b.employee_id === editingReq.employee_id && b.leave_type_id === editingReq.leave_type_id);
                if (!bal) return <p className="text-xs text-muted-foreground">⚠ No balance set for this type in {selectedYear}</p>;
                const carried = (bal as any).carried_forward || 0;
                const adj = (bal as any).adjustments || 0;
                const currentBal = carried + bal.total_days + adj - bal.used_days;
                return (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Starting Balance</span>
                      <span className="font-medium">{carried + bal.total_days}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accrued</span>
                      <span className="font-medium text-primary">+{adj}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Used</span>
                      <span className="font-medium text-destructive">-{bal.used_days}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="font-medium">Current Balance</span>
                      <span className={`font-bold ${currentBal <= 2 ? "text-destructive" : ""}`}>{currentBal}</span>
                    </div>
                  </div>
                );
              })()}
              <Button onClick={handleSaveReq} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Leave Type Modal */}
      <Dialog open={typeModalOpen} onOpenChange={setTypeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingType?.id ? "Edit Leave Type" : "Add Leave Type"}</DialogTitle></DialogHeader>
          {editingType && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                <Input value={editingType.name || ""} placeholder="e.g. Statutory Holiday, Annual Leave, IOU" onChange={e => setEditingType(p => p ? { ...p, name: e.target.value } : p)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Days/Year</label>
                <Input type="number" value={editingType.default_days_per_year || 0} onChange={e => setEditingType(p => p ? { ...p, default_days_per_year: Number(e.target.value) } : p)} />
              </div>
              <Button onClick={handleSaveType} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Balance Modal */}
      <Dialog open={balModalOpen} onOpenChange={setBalModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Set Leave Balance</DialogTitle></DialogHeader>
          {editingBal && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee *</label>
                  <Select value={editingBal.employee_id || ""} onValueChange={v => setEditingBal(p => p ? { ...p, employee_id: v } : p)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Leave Type *</label>
                  <Select value={editingBal.leave_type_id || ""} onValueChange={v => setEditingBal(p => p ? { ...p, leave_type_id: v } : p)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{leaveCode(t.name)} — {t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Year</label>
                  <Input type="number" value={editingBal.year || selectedYear} onChange={e => setEditingBal(p => p ? { ...p, year: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Carried Forward</label>
                  <Input type="number" value={(editingBal as any).carried_forward || 0} onChange={e => setEditingBal(p => p ? { ...p, carried_forward: Number(e.target.value) } as any : p)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Base Entitlement</label>
                  <Input type="number" value={editingBal.total_days || 0} onChange={e => setEditingBal(p => p ? { ...p, total_days: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Accrued <span className="text-primary">(+)</span>
                  </label>
                  <Input type="number" value={(editingBal as any).adjustments || 0} onChange={e => setEditingBal(p => p ? { ...p, adjustments: Number(e.target.value) } as any : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Used <span className="text-destructive">(−)</span>
                  </label>
                  <Input type="number" value={editingBal.used_days || 0} onChange={e => setEditingBal(p => p ? { ...p, used_days: Number(e.target.value) } : p)} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input value={(editingBal as any).adjustment_notes || ""} placeholder="e.g. SH accrued for Christmas" onChange={e => setEditingBal(p => p ? { ...p, adjustment_notes: e.target.value } as any : p)} />
              </div>

              {/* Live calculation preview */}
              {(() => {
                const carried = (editingBal as any).carried_forward || 0;
                const base = editingBal.total_days || 0;
                const adj = (editingBal as any).adjustments || 0;
                const used = editingBal.used_days || 0;
                const starting = carried + base;
                const current = starting + adj - used;
                return (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Carried Forward</span><span>{carried}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Base Entitlement</span><span>{base}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Starting Balance</span><span className="font-medium">{starting}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Accrued</span><span className="text-primary">+{adj}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Used</span><span className="text-destructive">−{used}</span></div>
                    <div className="flex justify-between border-t border-border pt-1.5">
                      <span className="font-bold">Current Balance</span>
                      <span className={`font-bold text-base ${current <= 2 && starting > 0 ? "text-destructive" : ""}`}>{current}</span>
                    </div>
                  </div>
                );
              })()}

              <Button onClick={handleSaveBal} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-header cells for the balance table
function SubHeaders() {
  return (
    <>
      <th className="px-2 py-1 text-right text-[9px] font-medium text-muted-foreground uppercase border-r border-border/30 min-w-[55px]">Start</th>
      <th className="px-2 py-1 text-right text-[9px] font-medium text-primary uppercase border-r border-border/30 min-w-[55px]">Accrued</th>
      <th className="px-2 py-1 text-right text-[9px] font-medium text-destructive uppercase border-r border-border/30 min-w-[50px]">Used</th>
      <th className="px-2 py-1 text-right text-[9px] font-bold uppercase border-r border-border min-w-[55px]">Bal</th>
    </>
  );
}

// Balance cells for each leave type per employee
function BalanceCells({ startingBal, accrued, used, currentBal, hasBal, onClick, n }: {
  startingBal: number; accrued: number; used: number; currentBal: number; hasBal: boolean;
  onClick: () => void; n: (v: number) => string;
}) {
  if (!hasBal) {
    return (
      <>
        <td colSpan={4} className="px-2 py-2 text-center border-r border-border/40">
          <button onClick={onClick} className="text-[10px] text-primary hover:underline">+ Set</button>
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums border-r border-border/30 cursor-pointer hover:bg-muted/30" onClick={onClick}>{n(startingBal)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-primary border-r border-border/30 cursor-pointer hover:bg-muted/30" onClick={onClick}>{accrued > 0 ? `+${n(accrued)}` : n(accrued)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-destructive border-r border-border/30 cursor-pointer hover:bg-muted/30" onClick={onClick}>{used > 0 ? `-${n(used)}` : n(used)}</td>
      <td className={`px-2 py-2 text-right tabular-nums font-bold border-r border-border/40 cursor-pointer hover:bg-muted/30 ${currentBal <= 2 && startingBal > 0 ? "text-destructive" : ""}`} onClick={onClick}>{n(currentBal)}</td>
    </>
  );
}

// Grand total cells
function GrandTotalCells({ starting, accrued, used, current, n }: { starting: number; accrued: number; used: number; current: number; n: (v: number) => string }) {
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums border-r border-border/30">{n(starting)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-primary border-r border-border/30">{accrued > 0 ? `+${n(accrued)}` : n(accrued)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-destructive border-r border-border/30">{used > 0 ? `-${n(used)}` : n(used)}</td>
      <td className="px-2 py-2 text-right tabular-nums font-bold border-r border-border">{n(current)}</td>
    </>
  );
}
