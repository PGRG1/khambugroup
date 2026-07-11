import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useHRData, type HREmployee } from "@/hooks/useHRData";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  TableSkeleton,
  EmptyState,
  fmtHKWhole,
  fmtDate,
} from "@/components/expenses/shared";
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, BookOpen } from "lucide-react";

interface EmployeeHistoryRow {
  id: string;
  employee_id: string;
  effective_date: string;
  change_type: string;
  old_value: string | null;
  new_value: string | null;
  field_changed: string | null;
  notes: string | null;
}

export default function HREmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const hr = useHRData();
  const [history, setHistory] = useState<EmployeeHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const emp: HREmployee | undefined = useMemo(
    () => hr.employees.find((e) => e.id === id),
    [hr.employees, id],
  );

  useEffect(() => {
    if (!tenantId || !id) return;
    (async () => {
      setHistoryLoading(true);
      const { data } = await supabase
        .from("hr_employee_history" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("employee_id", id)
        .order("effective_date", { ascending: false });
      setHistory((data as any[]) ?? []);
      setHistoryLoading(false);
    })();
  }, [tenantId, id]);

  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const year = now.getFullYear();

  const empPayroll = useMemo(
    () => hr.payroll.filter((p) => p.employee_id === id).sort((a, b) => (b.year - a.year) || (b.month - a.month)),
    [hr.payroll, id],
  );
  const ytdPayroll = useMemo(() => empPayroll.filter((p) => p.year === year), [empPayroll, year]);
  const ytdGross = ytdPayroll.reduce((s, p) => s + Number(p.gross_salary ?? p.actual_total ?? p.forecast_total ?? 0), 0);
  const ytdMpf = ytdPayroll.reduce((s, p) => s + Number(p.mpf_employer ?? 0), 0);
  const ytdNet = ytdPayroll.reduce((s, p) => s + Number(p.net_salary ?? 0), 0);

  const empLeaveBalances = useMemo(
    () => hr.leaveBalances.filter((b) => b.employee_id === id && b.year === year),
    [hr.leaveBalances, id, year],
  );
  const empLedger = useMemo(
    () => hr.leaveLedger.filter((l) => l.employee_id === id && l.year === year)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [hr.leaveLedger, id, year],
  );

  const upcomingShifts = useMemo(
    () => hr.shifts
      .filter((s) => s.employee_id === id && s.shift_date >= iso)
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date))
      .slice(0, 10),
    [hr.shifts, id, iso],
  );

  if (hr.loading) {
    return (
      <div className="p-6 space-y-6">
        <TableSkeleton rows={4} cols={6} />
      </div>
    );
  }
  if (!emp) {
    return (
      <div className="p-6 space-y-6">
        <EmptyState title="Employee not found" description="This employee does not exist in the current tenant." />
        <Button variant="outline" onClick={() => navigate("/hr/employees")}><ArrowLeft className="h-4 w-4 mr-2" /> Back to directory</Button>
      </div>
    );
  }

  const statusTone =
    (emp.status ?? "active") === "active" ? "success"
    : (emp.status ?? "").toLowerCase().includes("leave") ? "warning"
    : "default";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`${emp.first_name} ${emp.last_name}`}
        description={emp.job_title || "—"}
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/hr/employees"><ArrowLeft className="h-4 w-4 mr-1" /> Directory</Link></Button>
          </div>
        }
      />

      {/* Identity block */}
      <Card className="card-glass p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge variant="outline" className="capitalize">{emp.status || "active"}</Badge>
          <span className="text-muted-foreground">{emp.employment_type?.replace("_", " ")}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> {emp.department?.name || "—"}</span>
          <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {emp.venue || "—"}</span>
          {emp.email && <span className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {emp.email}</span>}
          {emp.phone && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {emp.phone}</span>}
          <span className="flex items-center gap-1 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Hired {fmtDate(emp.hire_date)}</span>
          {emp.end_date && <span className="flex items-center gap-1 text-warning"><Calendar className="h-3.5 w-3.5" /> Ends {fmtDate(emp.end_date)}</span>}
        </div>
      </Card>

      <KpiGrid>
        <KpiCard label={`YTD gross (${year})`} value={fmtHKWhole(ytdGross)} tone="info" />
        <KpiCard label="YTD net paid" value={fmtHKWhole(ytdNet)} tone="success" />
        <KpiCard label="YTD MPF employer" value={fmtHKWhole(ytdMpf)} />
        <KpiCard label="Leave (remaining)" value={
          empLeaveBalances.reduce((s, b) => s + Number(b.remaining_days ?? 0), 0).toFixed(1)
        } hint={`${empLeaveBalances.length} type${empLeaveBalances.length === 1 ? "" : "s"}`} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Leave balances */}
        <Card className="card-glass p-4">
          <div className="font-display font-semibold mb-3">Leave balances · {year}</div>
          {empLeaveBalances.length === 0 ? (
            <EmptyState title="No balances" description="No leave balances configured for this year." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium py-1">Type</th>
                  <th className="text-right font-medium py-1">Total</th>
                  <th className="text-right font-medium py-1">Used</th>
                  <th className="text-right font-medium py-1">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {empLeaveBalances.map((b) => (
                  <tr key={b.id}>
                    <td className="py-1.5">{(b as any).leave_type?.name || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(b.total_days).toFixed(1)}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(b.used_days).toFixed(1)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{Number(b.remaining_days).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Upcoming shifts */}
        <Card className="card-glass p-4">
          <div className="font-display font-semibold mb-3">Upcoming shifts</div>
          {upcomingShifts.length === 0 ? (
            <EmptyState title="No upcoming shifts" description="Nothing scheduled." />
          ) : (
            <div className="divide-y divide-border/40 text-sm">
              {upcomingShifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5">
                  <span>{fmtDate(s.shift_date)}</span>
                  <span className="tabular-nums text-muted-foreground">{s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</span>
                  <Badge variant="outline" className="text-[10px]">{s.status || "scheduled"}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Payroll history */}
        <Card className="card-glass p-4 lg:col-span-2">
          <div className="font-display font-semibold mb-3">Payroll history</div>
          {empPayroll.length === 0 ? (
            <EmptyState title="No payroll records" description="No payroll has been entered for this employee." />
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="text-left font-medium py-1.5">Period</th>
                    <th className="text-right font-medium">Gross</th>
                    <th className="text-right font-medium">Deductions</th>
                    <th className="text-right font-medium">MPF (ee/er)</th>
                    <th className="text-right font-medium">Net</th>
                    <th className="text-left font-medium">Status</th>
                    <th className="text-left font-medium">JE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {empPayroll.slice(0, 24).map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5">{p.year}-{String(p.month).padStart(2, "0")}</td>
                      <td className="text-right tabular-nums">{fmtHKWhole(Number(p.gross_salary || 0))}</td>
                      <td className="text-right tabular-nums">{fmtHKWhole(Number(p.total_deductions || 0))}</td>
                      <td className="text-right tabular-nums text-xs text-muted-foreground">
                        {fmtHKWhole(Number(p.mpf_employee || 0))} / {fmtHKWhole(Number(p.mpf_employer || 0))}
                      </td>
                      <td className="text-right tabular-nums font-medium">{fmtHKWhole(Number(p.net_salary || 0))}</td>
                      <td><Badge variant="outline" className="text-[10px]">{p.payment_status || "—"}</Badge></td>
                      <td>
                        {p.accrual_journal_entry_id ? (
                          <a href={`/finance/journal?entry=${p.accrual_journal_entry_id}`} className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                            <BookOpen className="h-3 w-3" /> JE
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Leave ledger */}
        <Card className="card-glass p-4 lg:col-span-2">
          <div className="font-display font-semibold mb-3">Leave ledger · {year}</div>
          {empLedger.length === 0 ? (
            <EmptyState title="No ledger entries" description="No leave ledger entries this year." />
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="text-left font-medium py-1.5">Date</th>
                    <th className="text-left font-medium">Description</th>
                    <th className="text-right font-medium">Accrued</th>
                    <th className="text-right font-medium">Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {empLedger.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1.5">{fmtDate(l.entry_date)}</td>
                      <td className="py-1.5">{l.description}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-500">{Number(l.accrued) > 0 ? `+${Number(l.accrued).toFixed(1)}` : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums text-destructive">{Number(l.taken) > 0 ? `-${Number(l.taken).toFixed(1)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Employment history */}
        <Card className="card-glass p-4 lg:col-span-2">
          <div className="font-display font-semibold mb-3">Employment history</div>
          {historyLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : history.length === 0 ? (
            <EmptyState title="No history" description="No employment history recorded." />
          ) : (
            <div className="divide-y divide-border/40 text-sm">
              {history.map((h) => (
                <div key={h.id} className="py-2 flex items-start gap-3">
                  <div className="text-xs text-muted-foreground tabular-nums w-24 shrink-0">{fmtDate(h.effective_date)}</div>
                  <div className="min-w-0">
                    <div className="font-medium capitalize">{h.change_type.replace("_", " ")}</div>
                    {h.field_changed && (
                      <div className="text-xs text-muted-foreground">
                        {h.field_changed}: {h.old_value || "—"} → {h.new_value || "—"}
                      </div>
                    )}
                    {h.notes && <div className="text-xs text-muted-foreground mt-0.5">{h.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
