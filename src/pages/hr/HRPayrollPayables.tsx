import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenues } from "@/hooks/useVenues";
import { supabase } from "@/integrations/supabase/client";

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const UNASSIGNED = "Unassigned";
const fmtMoney = (n: number) => `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function KCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "amber" | "green" | "red" | "sky" }) {
  const toneCls =
    tone === "amber" ? "text-amber-400" :
    tone === "green" ? "text-emerald-400" :
    tone === "red" ? "text-red-400" :
    tone === "sky" ? "text-sky-400" :
    "text-foreground";
  return (
    <Card className="card-glass">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold td-num ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

const AGEING_BUCKETS = [
  { v: "all", l: "All" },
  { v: "current", l: "Current" },
  { v: "1-30", l: "1–30 days" },
  { v: "31-60", l: "31–60 days" },
  { v: "61-90", l: "61–90 days" },
  { v: "90+", l: "90+ days" },
];

const KIND_TABS = [
  { v: "both", l: "Both" },
  { v: "salary", l: "Salary" },
  { v: "mpf", l: "MPF" },
];

type PayrollRow = {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  net_salary: number | null;
  mpf_employee: number | null;
  mpf_employer: number | null;
  salary_paid_amount: number | null;
  mpf_paid_amount: number | null;
  payment_status: string | null;
};

type EmpRow = { id: string; employee_code: string | null; first_name: string | null; last_name: string | null; venue_id: string | null; venue: string | null };

// Salary due 7th of following month; MPF due 10th of following month (HK MPF regulatory deadline).
function dueDates(y: number, m: number) {
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const salary = new Date(nextY, nextM - 1, 7);
  const mpf = new Date(nextY, nextM - 1, 10);
  return { salary, mpf };
}

export default function HRPayrollPayables() {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const { venues } = useVenues();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [emps, setEmps] = useState<Map<string, EmpRow>>(new Map());
  const [bucket, setBucket] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [kind, setKind] = useState<"both" | "salary" | "mpf">("both");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [payRows, empData] = await Promise.all([
        fetchAllRows(
          "hr_payroll",
          "id, employee_id, year, month, net_salary, mpf_employee, mpf_employer, salary_paid_amount, mpf_paid_amount, payment_status",
          undefined,
          tenantId,
        ),
        (supabase as any).from("hr_employees").select("id, employee_code, first_name, last_name, venue_id, venue").eq("tenant_id", tenantId),
      ]);
      if (cancelled) return;
      const map = new Map<string, EmpRow>();
      for (const e of ((empData as any)?.data || []) as EmpRow[]) map.set(e.id, e);
      setEmps(map);
      setRows(payRows as PayrollRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const venueById = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of venues) m.set(v.id, v.name);
    return m;
  }, [venues]);
  const venueByLowerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of venues) m.set(v.name.toLowerCase(), v.name);
    return m;
  }, [venues]);
  const resolveVenue = (e?: EmpRow): string => {
    if (!e) return UNASSIGNED;
    if (e.venue_id && venueById.has(e.venue_id)) return venueById.get(e.venue_id)!;
    const legacy = (e.venue || "").trim().toLowerCase();
    if (legacy && venueByLowerName.has(legacy)) return venueByLowerName.get(legacy)!;
    return UNASSIGNED;
  };

  const today = new Date();
  const todayMs = today.getTime();

  type EnrichedRow = {
    r: PayrollRow;
    emp?: EmpRow;
    empName: string;
    venueName: string;
    salaryOut: number;
    mpfTotal: number;
    mpfPaid: number;
    mpfOut: number;
    salaryDue: Date;
    mpfDue: Date;
    salaryDaysOverdue: number;
    mpfDaysOverdue: number;
    periodDaysOverdue: number; // max of both applicable
    periodDue: Date; // earlier of applicable due dates for bucketing
  };

  const enriched = useMemo<EnrichedRow[]>(() => {
    const out: EnrichedRow[] = [];
    for (const r of rows) {
      const salaryOut = (Number(r.net_salary) || 0) - (Number(r.salary_paid_amount) || 0);
      const mpfTotal = (Number(r.mpf_employee) || 0) + (Number(r.mpf_employer) || 0);
      const mpfPaid = Number(r.mpf_paid_amount) || 0;
      const mpfOut = mpfTotal - mpfPaid;
      const salaryOpen = salaryOut > 0.005;
      const mpfOpen = mpfOut > 0.005;
      if (!salaryOpen && !mpfOpen) continue;
      const { salary: salaryDue, mpf: mpfDue } = dueDates(r.year, r.month);
      const salaryDaysOverdue = Math.max(0, Math.floor((todayMs - salaryDue.getTime()) / 86400000));
      const mpfDaysOverdue = Math.max(0, Math.floor((todayMs - mpfDue.getTime()) / 86400000));
      // Bucketing uses the earliest applicable due date so an overdue obligation controls the row.
      let periodDue = salaryDue;
      let periodDaysOverdue = 0;
      if (salaryOpen && mpfOpen) {
        periodDue = salaryDue < mpfDue ? salaryDue : mpfDue;
        periodDaysOverdue = Math.max(salaryDaysOverdue, mpfDaysOverdue);
      } else if (salaryOpen) {
        periodDue = salaryDue; periodDaysOverdue = salaryDaysOverdue;
      } else {
        periodDue = mpfDue; periodDaysOverdue = mpfDaysOverdue;
      }
      const emp = emps.get(r.employee_id);
      const empName = emp ? `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "—" : "—";
      out.push({
        r, emp, empName, venueName: resolveVenue(emp),
        salaryOut: Math.max(0, salaryOut),
        mpfTotal, mpfPaid, mpfOut: Math.max(0, mpfOut),
        salaryDue, mpfDue, salaryDaysOverdue, mpfDaysOverdue,
        periodDue, periodDaysOverdue,
      });
    }
    return out;
  }, [rows, emps, venueById, venueByLowerName, todayMs]);

  const filtered = useMemo(() => enriched.filter((row) => {
    if (venueFilter !== "all" && row.venueName !== venueFilter) return false;
    if (kind === "salary" && row.salaryOut <= 0.005) return false;
    if (kind === "mpf" && row.mpfOut <= 0.005) return false;
    if (bucket !== "all") {
      const d = row.periodDaysOverdue;
      const dueMs = row.periodDue.getTime();
      if (bucket === "current" && !(dueMs >= todayMs)) return false;
      if (bucket === "1-30" && !(d >= 1 && d <= 30)) return false;
      if (bucket === "31-60" && !(d >= 31 && d <= 60)) return false;
      if (bucket === "61-90" && !(d >= 61 && d <= 90)) return false;
      if (bucket === "90+" && !(d > 90)) return false;
    }
    return true;
  }), [enriched, venueFilter, kind, bucket, todayMs]);

  const totals = useMemo(() => {
    let salary = 0, mpf = 0, overdue = 0;
    for (const row of filtered) {
      salary += row.salaryOut;
      mpf += row.mpfOut;
      if (row.salaryDaysOverdue > 0) overdue += row.salaryOut;
      if (row.mpfDaysOverdue > 0) overdue += row.mpfOut;
    }
    return { salary, mpf, overdue };
  }, [filtered]);

  const byPeriod = useMemo(() => {
    const m = new Map<string, EnrichedRow[]>();
    for (const row of filtered) {
      const key = `${row.r.year}-${String(row.r.month).padStart(2, "0")}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(row);
    }
    return Array.from(m.entries())
      .map(([key, rs]) => {
        const [y, mo] = key.split("-").map(Number);
        const salary = rs.reduce((s, r) => s + r.salaryOut, 0);
        const mpf = rs.reduce((s, r) => s + r.mpfOut, 0);
        const daysOverdue = rs.reduce((mx, r) => Math.max(mx, r.periodDaysOverdue), 0);
        return { key, year: y, month: mo, rows: rs, salary, mpf, daysOverdue };
      })
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

  const venueOptions = useMemo(() => {
    const s = new Set<string>();
    for (const row of enriched) s.add(row.venueName);
    return Array.from(s).sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)));
  }, [enriched]);

  const toggle = (k: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Payroll Payables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Outstanding salary and MPF grouped by period, aged by due date (salary: 7th of following month · MPF: 10th of following month)</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="All venues" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venueOptions.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KCard label="Total salary outstanding" value={fmtMoney(totals.salary)} tone="amber" />
        <KCard label="Total MPF outstanding" value={fmtMoney(totals.mpf)} tone="amber" />
        <KCard label="Overdue" value={fmtMoney(totals.overdue)} tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {KIND_TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => setKind(t.v as any)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${kind === t.v ? "bg-sky-400/15 border-sky-400 text-sky-400" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {t.l}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {AGEING_BUCKETS.map((b) => (
          <button
            key={b.v}
            onClick={() => setBucket(b.v)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${bucket === b.v ? "bg-amber-400/15 border-amber-400 text-amber-400" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {b.l}
          </button>
        ))}
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Open periods ({byPeriod.length})</div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : byPeriod.length === 0 ? (
            <div className="text-sm text-muted-foreground">No outstanding payroll in this bucket.</div>
          ) : (
            <div className="space-y-6">
              {byPeriod.map((group) => {
                const isOpen = expanded.has(group.key);
                return (
                  <div key={group.key}>
                    <div className="flex items-center justify-between mb-2 gap-3">
                      <button
                        onClick={() => toggle(group.key)}
                        className="flex items-center gap-1.5 text-sm font-semibold hover:text-amber-400"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {MONTHS_LONG[group.month - 1]} {group.year}
                        {group.daysOverdue > 0 && (
                          <Badge variant="outline" className={`ml-2 text-[10px] ${group.daysOverdue > 60 ? "text-red-400 border-red-400/60" : "text-amber-400 border-amber-400/60"}`}>
                            {group.daysOverdue}d overdue
                          </Badge>
                        )}
                      </button>
                      <div className="flex items-center gap-4">
                        <div className="text-xs text-muted-foreground">
                          Salary <span className="td-num text-amber-400 ml-1">{fmtMoney(group.salary)}</span>
                          <span className="mx-2 text-muted-foreground/50">·</span>
                          MPF <span className="td-num text-amber-400 ml-1">{fmtMoney(group.mpf)}</span>
                        </div>
                        <button
                          onClick={() => navigate(`/hr/payroll?year=${group.year}&month=${group.month}`)}
                          className="text-xs px-2.5 py-1 rounded-md border border-border hover:border-primary hover:text-primary transition-colors"
                        >
                          Record payment →
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                              <th className="text-left py-2 pr-4">Employee</th>
                              <th className="text-left py-2 pr-4">Venue</th>
                              <th className="text-right py-2 pr-4">Net salary</th>
                              <th className="text-right py-2 pr-4">Salary paid</th>
                              <th className="text-right py-2 pr-4">Salary out</th>
                              <th className="text-right py-2 pr-4">MPF total</th>
                              <th className="text-right py-2 pr-4">MPF paid</th>
                              <th className="text-right py-2 pr-4">MPF out</th>
                              <th className="text-left py-2 pr-4">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row) => (
                              <tr key={row.r.id} className="border-b border-border/40">
                                <td className="py-2 pr-4">
                                  <div className="flex flex-col">
                                    <span>{row.empName}</span>
                                    {row.emp?.employee_code && (
                                      <span className="text-[10px] font-mono text-muted-foreground">{row.emp.employee_code}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 pr-4">
                                  {row.venueName === UNASSIGNED ? (
                                    <span className="text-muted-foreground italic">Unassigned</span>
                                  ) : (
                                    <span>{row.venueName}</span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(Number(row.r.net_salary) || 0)}</td>
                                <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(Number(row.r.salary_paid_amount) || 0)}</td>
                                <td className={`py-2 pr-4 text-right td-num tabular-nums ${row.salaryOut > 0.005 ? "text-amber-400" : "text-muted-foreground/60"}`}>{fmtMoney(row.salaryOut)}</td>
                                <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(row.mpfTotal)}</td>
                                <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(row.mpfPaid)}</td>
                                <td className={`py-2 pr-4 text-right td-num tabular-nums ${row.mpfOut > 0.005 ? "text-amber-400" : "text-muted-foreground/60"}`}>{fmtMoney(row.mpfOut)}</td>
                                <td className="py-2 pr-4"><Badge variant="outline" className="text-[10px]">{row.r.payment_status || "pending"}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
