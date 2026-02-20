import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X } from "lucide-react";
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

  const activeEmployees = employees.filter(e => e.status === "active");

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

  return (
    <Tabs defaultValue="requests" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="types">Leave Types</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="requests" className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditingReq({ status: "pending", days: 1 }); setReqModalOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Leave Request</Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveRequests.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leave requests</TableCell></TableRow>
              ) : leaveRequests.map(r => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => { setEditingReq({ ...r }); setReqModalOpen(true); }}>
                  <TableCell className="font-medium">{r.employee?.first_name} {r.employee?.last_name}</TableCell>
                  <TableCell>{r.leave_type?.name || "—"}</TableCell>
                  <TableCell>{r.start_date}</TableCell>
                  <TableCell>{r.end_date}</TableCell>
                  <TableCell>{r.days}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[r.status] as any || "secondary"}>{r.status}</Badge></TableCell>
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

      <TabsContent value="balances" className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditingBal({ year: new Date().getFullYear(), total_days: 0, used_days: 0, remaining_days: 0 }); setBalModalOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Set Balance</Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveBalances.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No balances set</TableCell></TableRow>
              ) : leaveBalances.map(b => {
                const emp = employees.find(e => e.id === b.employee_id);
                return (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => { setEditingBal({ ...b }); setBalModalOpen(true); }}>
                    <TableCell className="font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                    <TableCell>{b.leave_type?.name || "—"}</TableCell>
                    <TableCell>{b.year}</TableCell>
                    <TableCell>{b.total_days}</TableCell>
                    <TableCell>{b.used_days}</TableCell>
                    <TableCell className={b.remaining_days <= 2 ? "text-destructive font-medium" : ""}>{b.remaining_days}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="types" className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setEditingType({ name: "", default_days_per_year: 0, is_paid: true, is_active: true }); setTypeModalOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Leave Type</Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Default Days/Year</TableHead>
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
                  <TableCell>{t.default_days_per_year}</TableCell>
                  <TableCell>{t.is_paid ? "Yes" : "No"}</TableCell>
                  <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

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
                  <Input type="date" value={editingReq.start_date || ""} onChange={e => setEditingReq(p => p ? { ...p, start_date: e.target.value } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
                  <Input type="date" value={editingReq.end_date || ""} onChange={e => setEditingReq(p => p ? { ...p, end_date: e.target.value } : p)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Days</label>
                <Input type="number" value={editingReq.days || 1} onChange={e => setEditingReq(p => p ? { ...p, days: Number(e.target.value) } : p)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
                <Input value={editingReq.reason || ""} onChange={e => setEditingReq(p => p ? { ...p, reason: e.target.value } : p)} />
              </div>
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
                  <Input type="number" value={editingBal.year || new Date().getFullYear()} onChange={e => setEditingBal(p => p ? { ...p, year: Number(e.target.value) } : p)} />
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
              <Button onClick={handleSaveBal} disabled={saving} className="w-full">{saving ? "Saving..." : "Save"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
