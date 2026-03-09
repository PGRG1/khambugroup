import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X, Calendar, Users, TreePalm, Clock, AlertTriangle, User, LayoutGrid, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HRLeaveRequest, HRLeaveType, HRLeaveBalance, HREmployee, HRLeaveLedger } from "@/hooks/useHRData";

interface Props {
  leaveRequests: HRLeaveRequest[];
  leaveTypes: HRLeaveType[];
  leaveBalances: HRLeaveBalance[];
  employees: HREmployee[];
  leaveLedger: HRLeaveLedger[];
  onSaveRequest: (r: Partial<HRLeaveRequest>) => Promise<boolean>;
  onSaveType: (t: Partial<HRLeaveType>) => Promise<boolean>;
  onSaveBalance: (b: Partial<HRLeaveBalance>) => Promise<boolean>;
  onSaveLedger: (e: Partial<HRLeaveLedger>) => Promise<boolean>;
  onDeleteLedger: (id: string) => Promise<boolean>;
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

export function LeaveManagementTab({ leaveRequests, leaveTypes, leaveBalances, employees, leaveLedger, onSaveRequest, onSaveType, onSaveBalance, onSaveLedger, onDeleteLedger }: Props) {
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
  const [balanceViewMode, setBalanceViewMode] = useState<"summary" | "employee">("summary");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TreePalm className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total Entitlement</span>
            </div>
            <p className="text-2xl font-bold">{kpiStats.totalEntitlement}</p>
            <p className="text-[10px] text-muted-foreground">days across all staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Used</span>
            </div>
            <p className="text-2xl font-bold">{kpiStats.totalUsed}</p>
            <p className="text-[10px] text-muted-foreground">
              {kpiStats.totalEntitlement > 0 ? `${((kpiStats.totalUsed / kpiStats.totalEntitlement) * 100).toFixed(0)}% utilised` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Remaining</span>
            </div>
            <p className="text-2xl font-bold">{kpiStats.totalRemaining}</p>
            <p className="text-[10px] text-muted-foreground">days available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold">{kpiStats.pendingCount}</p>
            <p className="text-[10px] text-muted-foreground">awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Low Balance</span>
            </div>
            <p className="text-2xl font-bold">{kpiStats.lowBalanceCount}</p>
            <p className="text-[10px] text-muted-foreground">≤2 days remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Balance Overview</TabsTrigger>
          <TabsTrigger value="requests">Requests ({yearRequests.length})</TabsTrigger>
          <TabsTrigger value="types">Leave Types</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
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
            <div className="flex items-center gap-1 ml-auto border border-border rounded-lg p-0.5">
              <button
                onClick={() => setBalanceViewMode("summary")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                  balanceViewMode === "summary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                Summary
              </button>
              <button
                onClick={() => {
                  setBalanceViewMode("employee");
                  if (!selectedEmployee && filteredEmployees.length > 0) {
                    setSelectedEmployee(filteredEmployees[0].id);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                  balanceViewMode === "employee" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="h-3 w-3" />
                Employee
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{filteredEmployees.length} employees</p>
          </div>

          {activeLeaveTypes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No leave types configured. Add leave types first (e.g. SH, AL, IOU).</p>
              </CardContent>
            </Card>
          ) : balanceViewMode === "summary" ? (
            /* SUMMARY VIEW - Balance only per leave type */
            <div className="border border-border rounded-lg overflow-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider border-r border-border sticky left-0 bg-muted/60 min-w-[40px]">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider border-r border-border sticky left-[40px] bg-muted/60 min-w-[140px]">Employee</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider border-r border-border min-w-[80px]">Venue</th>
                    {activeLeaveTypes.map(lt => (
                      <th key={lt.id} className="px-3 py-2 text-center font-bold text-[10px] uppercase tracking-wider border-r border-border min-w-[60px]">
                        <span className="text-primary">{leaveCode(lt.name)}</span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-bold text-[10px] uppercase tracking-wider bg-muted/70 min-w-[60px]">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {balanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={3 + activeLeaveTypes.length + 1} className="text-center text-muted-foreground py-8">
                        <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        No employees match filter
                      </td>
                    </tr>
                  ) : (
                    <>
                      {balanceRows.map((row, idx) => {
                        const emp = row.employee;
                        return (
                          <tr
                            key={emp.id}
                            className="border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
                            onClick={() => { setSelectedEmployee(emp.id); setBalanceViewMode("employee"); }}
                          >
                            <td className="px-3 py-2 text-center text-muted-foreground border-r border-border/40 sticky left-0 bg-card">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium border-r border-border/40 sticky left-[40px] bg-card">
                              {emp.first_name} {emp.last_name}
                              {emp.job_title && <span className="block text-[9px] text-muted-foreground font-normal">{emp.job_title}</span>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground border-r border-border/40">{emp.venue || "—"}</td>
                            {activeLeaveTypes.map(lt => {
                              const data = row.byType[lt.id];
                              const hasBal = !!data.balance;
                              if (!hasBal) {
                                return (
                                  <td key={lt.id} className="px-2 py-2 text-center border-r border-border/40 text-muted-foreground">—</td>
                                );
                              }
                              return (
                                <td
                                  key={lt.id}
                                  className={`px-2 py-2 text-center tabular-nums font-semibold border-r border-border/40 ${data.currentBal <= 2 && data.startingBal > 0 ? "text-destructive" : ""}`}
                                >
                                  {n(data.currentBal)}
                                </td>
                              );
                            })}
                            <td className={`px-2 py-2 text-center tabular-nums font-bold bg-muted/20 ${row.totalCurrent <= 2 && row.totalStarting > 0 ? "text-destructive" : ""}`}>
                              {n(row.totalCurrent)}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Grand total row */}
                      <tr className="bg-muted/50 font-bold border-t-2 border-border">
                        <td colSpan={3} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider sticky left-0 bg-muted/50">Grand Total</td>
                        {activeLeaveTypes.map(lt => {
                          const total = balanceRows.reduce((s, r) => s + r.byType[lt.id].currentBal, 0);
                          return (
                            <td key={lt.id} className="px-2 py-2 text-center tabular-nums font-bold border-r border-border/40">{n(total)}</td>
                          );
                        })}
                        <td className="px-2 py-2 text-center tabular-nums font-bold bg-muted/40">{n(balanceRows.reduce((s, r) => s + r.totalCurrent, 0))}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* EMPLOYEE LEDGER VIEW - Per-employee leave breakdown */
            <EmployeeLedgerView
              employees={filteredEmployees}
              selectedEmployeeId={selectedEmployee}
              onSelectEmployee={setSelectedEmployee}
              activeLeaveTypes={activeLeaveTypes}
              allBalances={leaveBalances}
              allRequests={leaveRequests}
              selectedYear={selectedYear}
              onEditBalance={(bal) => { setEditingBal(bal); setBalModalOpen(true); }}
              n={n}
            />
          )}

          <div className="flex gap-4 text-[10px] text-muted-foreground flex-wrap">
            <span><span className="font-bold text-foreground">Balance</span> = Carried Forward + Entitlement + Accrued − Used</span>
            <span className="italic">{balanceViewMode === "summary" ? "Click any row for employee detail" : "Click any row to edit"}</span>
          </div>
        </TabsContent>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {pendingRequests.length} pending · {approvedRequests.length} approved · {selectedYear}
            </p>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leave requests for {selectedYear}</TableCell></TableRow>
                ) : yearRequests.map(r => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => { setEditingReq({ ...r }); setReqModalOpen(true); }}>
                    <TableCell className="font-medium text-xs">{r.employee?.first_name} {r.employee?.last_name}</TableCell>
                    <TableCell className="text-xs">{r.leave_type?.name || "—"}</TableCell>
                    <TableCell className="text-xs">{r.start_date}</TableCell>
                    <TableCell className="text-xs">{r.end_date}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{r.days}</TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[r.status] as any || "secondary"} className="text-[10px]">{r.status}</Badge></TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleApprove(r, "approved")}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleApprove(r, "rejected")}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TYPES TAB */}
        <TabsContent value="types" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingType({ name: "", default_days_per_year: 0, is_paid: true, is_active: true }); setTypeModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Leave Type
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Default Days/Year</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveTypes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No leave types — add SH, AL, IOU to get started</TableCell></TableRow>
                ) : leaveTypes.map(t => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => { setEditingType({ ...t }); setTypeModalOpen(true); }}>
                    <TableCell><Badge variant="outline" className="text-[10px] font-mono">{leaveCode(t.name)}</Badge></TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right">{t.default_days_per_year}</TableCell>
                    <TableCell>{t.is_paid ? "Yes" : "No"}</TableCell>
                    <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

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

// Per-employee ledger view — spreadsheet-style per leave type
function EmployeeLedgerView({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  activeLeaveTypes,
  allBalances,
  allRequests,
  selectedYear,
  onEditBalance,
  n,
}: {
  employees: HREmployee[];
  selectedEmployeeId: string | null;
  onSelectEmployee: (id: string) => void;
  activeLeaveTypes: HRLeaveType[];
  allBalances: HRLeaveBalance[];
  allRequests: HRLeaveRequest[];
  selectedYear: number;
  onEditBalance: (bal: Partial<HRLeaveBalance>) => void;
  n: (v: number) => string;
}) {
  const emp = employees.find(e => e.id === selectedEmployeeId);
  const empIdx = employees.findIndex(e => e.id === selectedEmployeeId);
  const LEDGER_ROWS = 10;

  const goPrev = () => { if (empIdx > 0) onSelectEmployee(employees[empIdx - 1].id); };
  const goNext = () => { if (empIdx < employees.length - 1) onSelectEmployee(employees[empIdx + 1].id); };

  if (!emp) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
          Select an employee to view their leave ledger.
        </CardContent>
      </Card>
    );
  }

  const empBalances = allBalances.filter(b => b.employee_id === emp.id);
  const empRequests = allRequests.filter(r => r.employee_id === emp.id);

  // Find all years
  const balanceYears = [...new Set(empBalances.map(b => b.year))];
  const requestYears = [...new Set(empRequests.map(r => parseInt(r.start_date.slice(0, 4))))];
  const allYears = [...new Set([...balanceYears, ...requestYears, selectedYear])].sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      {/* Employee navigator */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
        <button onClick={goPrev} disabled={empIdx <= 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <Select value={emp.id} onValueChange={onSelectEmployee}>
            <SelectTrigger className="border-0 shadow-none h-auto p-0 text-base font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e, i) => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="text-muted-foreground mr-2">{i + 1}.</span>
                  {e.first_name} {e.last_name}
                  {e.venue && <span className="text-muted-foreground ml-2">· {e.venue}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 mt-0.5">
            {emp.job_title && <span className="text-[10px] text-muted-foreground">{emp.job_title}</span>}
            {emp.venue && <span className="text-[10px] text-muted-foreground">· {emp.venue}</span>}
            <span className="text-[10px] text-muted-foreground">· {empIdx + 1} of {employees.length}</span>
          </div>
        </div>
        <button onClick={goNext} disabled={empIdx >= employees.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Per-year sections */}
      {allYears.map(year => {
        const yearBals = empBalances.filter(b => b.year === year);
        const yearReqs = empRequests.filter(r => r.start_date.startsWith(String(year)));
        const hasData = yearBals.length > 0;

        return (
          <div key={year} className="space-y-5">
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-bold ${year === selectedYear ? "text-primary" : "text-foreground"}`}>{year}</h3>
              {year === selectedYear && <Badge variant="secondary" className="text-[9px]">Current</Badge>}
              {!hasData && (
                <Button
                  size="sm" variant="ghost" className="h-5 px-2 text-[10px] text-primary"
                  onClick={() => onEditBalance({
                    employee_id: emp.id, leave_type_id: activeLeaveTypes[0]?.id, year,
                    total_days: 0, used_days: 0, remaining_days: 0, carried_forward: 0, adjustments: 0, adjustment_notes: "",
                  } as any)}
                >
                  <Plus className="h-3 w-3 mr-0.5" /> Set Balance
                </Button>
              )}
            </div>

            {/* One ledger card per leave type */}
            {activeLeaveTypes.map(lt => {
              const bal = yearBals.find(b => b.leave_type_id === lt.id);
              const carried = (bal as any)?.carried_forward || 0;
              const base = bal?.total_days || 0;
              const adjustments = (bal as any)?.adjustments || 0;
              const startingBalance = carried + base + adjustments;
              const typeReqs = yearReqs
                .filter(r => r.leave_type_id === lt.id && r.status === "approved")
                .sort((a, b) => a.start_date.localeCompare(b.start_date));

              if (!bal) return null;

              // Build ledger entries with running balance
              const ledgerEntries: { date: string; reason: string; days: number; runningBalance: number }[] = [];
              let running = startingBalance;
              typeReqs.forEach(r => {
                running -= r.days;
                ledgerEntries.push({
                  date: r.start_date,
                  reason: r.reason || r.leave_type?.name || "Leave",
                  days: r.days,
                  runningBalance: running,
                });
              });

              const code = leaveCode(lt.name);

              return (
                <div key={lt.id} className="space-y-2">
                  {/* Section header */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b-2 border-primary pb-0.5">
                      {lt.name.toUpperCase()}
                    </h4>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onEditBalance({ ...bal! })}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Starting balance */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-semibold text-foreground">Starting Balance</span>
                    <span className="px-3 py-0.5 bg-primary/10 text-primary font-bold rounded text-sm tabular-nums">
                      {startingBalance}
                    </span>
                    {carried > 0 && (
                      <span className="text-[10px] text-muted-foreground">(Carried: {carried} + Entitlement: {base}{adjustments > 0 ? ` + Adj: ${adjustments}` : ""})</span>
                    )}
                  </div>

                  {/* Ledger table */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 border-b border-border">
                          <th className="px-3 py-1.5 text-center font-semibold text-[10px] uppercase tracking-wider w-[40px]">#</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider w-[110px]">Date</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider">Leave Type</th>
                          <th className="px-3 py-1.5 text-center font-semibold text-[10px] uppercase tracking-wider w-[60px]">Days</th>
                          <th className="px-3 py-1.5 text-center font-semibold text-[10px] uppercase tracking-wider w-[100px]">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: LEDGER_ROWS }).map((_, idx) => {
                          const entry = ledgerEntries[idx];
                          const isFilledRow = !!entry;
                          return (
                            <tr
                              key={idx}
                              className={`border-b border-border/40 ${isFilledRow ? "bg-accent/30" : ""}`}
                            >
                              <td className="px-3 py-1.5 text-center tabular-nums text-muted-foreground font-medium">{idx + 1}</td>
                              <td className="px-3 py-1.5 tabular-nums text-primary font-medium">
                                {entry?.date ? new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : ""}
                              </td>
                              <td className="px-3 py-1.5 text-primary">
                                {entry?.reason || ""}
                              </td>
                              <td className="px-3 py-1.5 text-center tabular-nums font-medium">
                                {entry ? entry.days : 0}
                              </td>
                              <td className="px-3 py-1.5 text-center tabular-nums font-bold">
                                {entry ? entry.runningBalance : (idx === 0 && !entry ? startingBalance : (ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : startingBalance))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
