import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Plus, Check, X, Calendar, Users, TreePalm, Clock, AlertTriangle } from "lucide-react";
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

  const activeEmployees = employees.filter(e => e.status === "active");
  
  // Current year balances
  const yearBalances = useMemo(() => {
    return leaveBalances.filter(b => b.year === selectedYear);
  }, [leaveBalances, selectedYear]);

  // Year requests (approved only for usage stats)
  const yearRequests = useMemo(() => {
    const yearStr = String(selectedYear);
    return leaveRequests.filter(r => r.start_date.startsWith(yearStr));
  }, [leaveRequests, selectedYear]);

  const approvedRequests = useMemo(() => yearRequests.filter(r => r.status === "approved"), [yearRequests]);
  const pendingRequests = useMemo(() => yearRequests.filter(r => r.status === "pending"), [yearRequests]);

  // KPI stats
  const kpiStats = useMemo(() => {
    const totalEntitlement = yearBalances.reduce((s, b) => s + b.total_days, 0);
    const totalUsed = yearBalances.reduce((s, b) => s + b.used_days, 0);
    const totalRemaining = yearBalances.reduce((s, b) => s + b.remaining_days, 0);
    const lowBalanceCount = activeEmployees.filter(emp => {
      const empBals = yearBalances.filter(b => b.employee_id === emp.id);
      return empBals.some(b => b.remaining_days <= 2 && b.total_days > 0);
    }).length;
    return { totalEntitlement, totalUsed, totalRemaining, lowBalanceCount, pendingCount: pendingRequests.length };
  }, [yearBalances, activeEmployees, pendingRequests]);

  // Employee-level summary with usage by leave type
  const employeeSummaries = useMemo(() => {
    const filtered = filterEmployee === "all" ? activeEmployees : activeEmployees.filter(e => e.id === filterEmployee);
    return filtered.map(emp => {
      const empBalances = yearBalances.filter(b => b.employee_id === emp.id);
      const totalEntitlement = empBalances.reduce((s, b) => s + b.total_days, 0);
      const totalUsed = empBalances.reduce((s, b) => s + b.used_days, 0);
      const totalRemaining = empBalances.reduce((s, b) => s + b.remaining_days, 0);
      const usagePct = totalEntitlement > 0 ? (totalUsed / totalEntitlement) * 100 : 0;
      return {
        employee: emp,
        balances: empBalances,
        totalEntitlement,
        totalUsed,
        totalRemaining,
        usagePct,
      };
    }).sort((a, b) => b.usagePct - a.usagePct);
  }, [activeEmployees, yearBalances, filterEmployee]);

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
    const ok = await onSaveBalance(editingBal);
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
          <Button size="sm" variant="outline" onClick={() => { setEditingBal({ year: selectedYear, total_days: 0, used_days: 0, remaining_days: 0 }); setBalModalOpen(true); }}>
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
              <Clock className="h-4 w-4 text-amber-500" />
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

        {/* OVERVIEW TAB - Employee leave usage dashboard */}
        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {activeEmployees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{employeeSummaries.length} employees</p>
          </div>

          {employeeSummaries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No leave balances set for {selectedYear}.</p>
                <p className="text-xs mt-1">Click "Set Balance" to assign leave entitlements.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {employeeSummaries.map(({ employee: emp, balances: empBals, totalEntitlement, totalUsed, totalRemaining, usagePct }) => (
                <Card key={emp.id} className="overflow-hidden">
                  <div className="p-4">
                    {/* Employee header with overall bar */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {emp.first_name[0]}{emp.last_name[0]}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{emp.first_name} {emp.last_name}</p>
                          <p className="text-[10px] text-muted-foreground">{emp.job_title || emp.employment_type} · {emp.venue || "—"}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{totalRemaining} <span className="text-xs font-normal text-muted-foreground">/ {totalEntitlement} days left</span></p>
                        <p className="text-[10px] text-muted-foreground">{totalUsed} used ({usagePct.toFixed(0)}%)</p>
                      </div>
                    </div>

                    {/* Overall progress bar */}
                    <div className="mb-3">
                      <Progress value={Math.min(usagePct, 100)} className="h-2" />
                    </div>

                    {/* Per leave-type breakdown */}
                    {empBals.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {empBals.map(bal => {
                          const pct = bal.total_days > 0 ? (bal.used_days / bal.total_days) * 100 : 0;
                          const isLow = bal.remaining_days <= 2 && bal.total_days > 0;
                          return (
                            <div
                              key={bal.id}
                              className="p-2.5 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors"
                              onClick={() => { setEditingBal({ ...bal }); setBalModalOpen(true); }}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium">{bal.leave_type?.name || "Unknown"}</span>
                                <span className={`text-xs font-bold ${isLow ? "text-destructive" : ""}`}>
                                  {bal.remaining_days}/{bal.total_days}
                                </span>
                              </div>
                              <div className="w-full bg-secondary rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary"
                                  }`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {bal.used_days} used · {bal.remaining_days} left
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
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
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Default Days/Year</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveTypes.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No leave types</TableCell></TableRow>
                ) : leaveTypes.map(t => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => { setEditingType({ ...t }); setTypeModalOpen(true); }}>
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
                  <SelectContent>{leaveTypes.filter(t => t.is_active).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
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
              {/* Show current balance context */}
              {editingReq.employee_id && editingReq.leave_type_id && (() => {
                const bal = yearBalances.find(b => b.employee_id === editingReq.employee_id && b.leave_type_id === editingReq.leave_type_id);
                if (!bal) return <p className="text-xs text-amber-600">⚠ No balance set for this leave type in {selectedYear}</p>;
                return (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border text-xs">
                    <span className="text-muted-foreground">Balance: </span>
                    <span className="font-medium">{bal.remaining_days}</span>
                    <span className="text-muted-foreground"> remaining of </span>
                    <span className="font-medium">{bal.total_days}</span>
                    <span className="text-muted-foreground"> ({bal.used_days} used)</span>
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
                <Input value={editingType.name || ""} onChange={e => setEditingType(p => p ? { ...p, name: e.target.value } : p)} />
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Set Leave Balance</DialogTitle></DialogHeader>
          {editingBal && (
            <div className="space-y-4 pt-2">
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
                  <SelectContent>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Year</label>
                  <Input type="number" value={editingBal.year || selectedYear} onChange={e => setEditingBal(p => p ? { ...p, year: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Total Days</label>
                  <Input type="number" value={editingBal.total_days || 0} onChange={e => setEditingBal(p => p ? { ...p, total_days: Number(e.target.value), remaining_days: Number(e.target.value) - (p?.used_days || 0) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Used Days</label>
                  <Input type="number" value={editingBal.used_days || 0} onChange={e => setEditingBal(p => p ? { ...p, used_days: Number(e.target.value), remaining_days: (p?.total_days || 0) - Number(e.target.value) } : p)} />
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground">Remaining: <span className="font-bold text-foreground">{(editingBal.total_days || 0) - (editingBal.used_days || 0)} days</span></p>
              </div>
              <Button onClick={handleSaveBal} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
