import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, FileStack, Landmark, Repeat, Paperclip, ArrowRight, Sparkles, ShieldAlert } from "lucide-react";
import { useExpenseBills, ExpenseBill } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import { useRecurringExpenses } from "@/hooks/useRecurringExpenses";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  KpiCard,
  KpiGrid,
  KpiSkeleton,
  TableSkeleton,
  StatusPill,
  EmptyState,
  approvalVariant,
  paymentVariant,
  APPROVAL_LABEL,
  PAYMENT_LABEL,
  fmtHKWhole,
  fmtDate,
  ScopeLine,
} from "@/components/expenses/shared";

// Recognition date used for monthly reporting (period_start for recurring bills,
// service_period_start for manual, falling back to bill_date).
const recognitionDate = (b: ExpenseBill): string =>
  (b.period_start as string) || (b.service_period_start as string) || b.bill_date;

interface UnifiedRow {
  id: string;
  date: string;
  source: "bill" | "statement" | "bank" | "recurring";
  vendor: string;
  category: string;
  venue: string;
  amount: number;
  due: string | null;
  payment_status: string;
  approval_status: string;
  attachment_url?: string | null;
  source_type?: string;
}

export default function ExpensesOverview() {
  const { tenantId } = useActiveTenant();
  const { bills, loading: bLoad } = useExpenseBills();
  const { statements, loading: sLoad } = useVendorStatements();
  const { rules, loading: rLoad } = useRecurringExpenses();
  const [bankExpenses, setBankExpenses] = useState<any[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [masterCounts, setMasterCounts] = useState<{ categories: number; vendors: number; terms: number } | null>(
    null
  );

  useEffect(() => {
    if (!tenantId) {
      setBankExpenses([]);
      setBankLoading(false);
      return;
    }
    setBankLoading(true);
    (async () => {
      try {
        // Server-side tenant filter via fetchAllRows(tenantId) — defence-in-depth
        // beyond RLS, and avoids over-fetching other tenants' rows.
        const rows = await fetchAllRows(
          "bank_transactions",
          "id,transaction_date,description,amount,category,bank_account_id,expense_posted_bill_id",
          { col: "transaction_date", asc: false },
          tenantId
        );
        setBankExpenses(
          (rows as any[]).filter(
            (r) => Number(r.amount) < 0 || /charge|fee|interest|debit/i.test(r.description || "")
          )
        );
      } catch {
        setBankExpenses([]);
      } finally {
        setBankLoading(false);
      }
    })();
  }, [tenantId]);

  // Master-data readiness check — surfaces the "set up first" banner.
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [c, v, t] = await Promise.all([
        supabase.from("expense_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("expense_payment_terms").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ]);
      setMasterCounts({
        categories: c.count ?? 0,
        vendors: v.count ?? 0,
        terms: t.count ?? 0,
      });
    })();
  }, [tenantId]);

  const now = useMemo(() => new Date(), []);
  // Period selector — drives all MTD figures. "current" = this month, "prev" = last
  // month, "ytd" = year-to-date.
  const [period, setPeriod] = useState<"current" | "prev" | "ytd">("current");
  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    if (period === "prev") {
      const s = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const e = new Date(y, m, 0).toISOString().slice(0, 10);
      return { periodStart: s, periodEnd: e, periodLabel: "Previous month" };
    }
    if (period === "ytd") {
      const s = new Date(y, 0, 1).toISOString().slice(0, 10);
      const e = new Date(y, 11, 31).toISOString().slice(0, 10);
      return { periodStart: s, periodEnd: e, periodLabel: "Year to date" };
    }
    const s = new Date(y, m, 1).toISOString().slice(0, 10);
    const e = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { periodStart: s, periodEnd: e, periodLabel: "This month" };
  }, [period, now]);
  const today = now.toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    const inPeriod = (d: string) => d >= periodStart && d <= periodEnd;
    const billsInPeriod = bills.filter((b) => inPeriod(recognitionDate(b)));
    // Actual = posted only (writes are in the GL). Approved-but-not-posted is a
    // separate tile so the two are never confused on the ledger.
    const actual = billsInPeriod
      .filter((b) => b.approval_status === "posted")
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const approvedUnposted = billsInPeriod
      .filter((b) => b.approval_status === "approved")
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const pending = billsInPeriod
      .filter((b) => b.approval_status === "draft" || b.approval_status === "pending_review")
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const expected = rules
      .filter(
        (r) =>
          r.status === "active" &&
          r.next_generation_date &&
          r.next_generation_date >= periodStart &&
          r.next_generation_date <= periodEnd
      )
      .reduce((s, r) => s + Number(r.expected_amount || 0), 0);
    const overdue = bills.filter(
      (b) => b.due_date && b.due_date < today && b.payment_status !== "paid"
    ).length;
    const needsReview =
      bills.filter((b) => b.approval_status === "pending_review").length +
      statements.filter((s) => s.approval_status === "pending_review").length;
    const lateFees = statements.reduce((s, x) => s + Number(x.late_fees || 0), 0);
    const bankDetected = bankExpenses.filter((b) => !b.expense_posted_bill_id).length;
    return { actual, approvedUnposted, pending, expected, overdue, needsReview, lateFees, bankDetected };
  }, [bills, statements, rules, bankExpenses, periodStart, periodEnd, today]);

  const unified: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    bills.forEach((b) =>
      rows.push({
        id: `b-${b.id}`,
        date: recognitionDate(b),
        source: b.source_type === "recurring_rule" ? "recurring" : "bill",
        vendor: b.vendor_name || "—",
        category: "—",
        venue: b.venue || (b.combined_venues ? "All Venues" : "—"),
        amount: Number(b.total_amount || 0),
        due: b.due_date,
        payment_status: b.payment_status,
        approval_status: b.approval_status,
        attachment_url: b.attachment_url,
        source_type: b.source_type,
      })
    );
    statements.forEach((s) =>
      rows.push({
        id: `s-${s.id}`,
        date: s.statement_date,
        source: "statement",
        vendor: s.vendor_name || "—",
        category: "Statement",
        venue: "—",
        amount: Number(s.current_period_charges || 0) + Number(s.late_fees || 0),
        due: null,
        payment_status: s.payment_status,
        approval_status: s.approval_status,
      })
    );
    bankExpenses.forEach((b) =>
      rows.push({
        id: `bk-${b.id}`,
        date: b.transaction_date,
        source: "bank",
        vendor: b.description || "Bank",
        category: b.category || "Bank Charge",
        venue: "—",
        amount: Math.abs(Number(b.amount || 0)),
        due: null,
        payment_status: b.expense_posted_bill_id ? "paid" : "unpaid",
        approval_status: b.expense_posted_bill_id ? "posted" : "draft",
      })
    );
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [bills, statements, bankExpenses]);

  const [tab, setTab] = useState("all");
  const filtered = useMemo(() => {
    switch (tab) {
      case "bills":
        return unified.filter((r) => r.source === "bill");
      case "recurring-bills":
        return unified.filter((r) => r.source === "recurring");
      case "statements":
        return unified.filter((r) => r.source === "statement");
      case "bank":
        return unified.filter((r) => r.source === "bank");
      case "rules":
        return [];
      case "review":
        return unified.filter(
          (r) => r.approval_status === "pending_review" || r.approval_status === "draft"
        );
      case "overdue":
        return unified.filter(
          (r) => r.due && r.due < today && r.payment_status !== "paid"
        );
      default:
        return unified;
    }
  }, [tab, unified, today]);

  const anyLoading = bLoad || sLoad || rLoad || bankLoading;
  const masterMissing =
    !!masterCounts && (masterCounts.categories === 0 || masterCounts.vendors === 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Expenses"
        title="Control centre"
        description="All non-inventory costs, in one place. Monthly figures use the expense recognition date."
        actions={
          <>
            <Link to="/expenses/recurring"><Button variant="ghost" size="sm" className="h-9"><Repeat className="h-4 w-4 mr-1" /> Recurring</Button></Link>
            <Link to="/expenses/statements"><Button variant="ghost" size="sm" className="h-9"><FileStack className="h-4 w-4 mr-1" /> Statements</Button></Link>
            <Link to="/expenses/bank-detected"><Button variant="outline" size="sm" className="h-9"><Landmark className="h-4 w-4 mr-1" /> Bank-detected</Button></Link>
            <Link to="/expenses/bills"><Button size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" /> New expense</Button></Link>
          </>
        }
      />

      {/* Master-data setup guide — only shows when categories or vendors are missing */}
      {masterMissing && (
        <div className="card-glass rounded-xl border border-warning/40 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-warning/10 p-2 text-warning shrink-0">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Finish setting up master data first</div>
              <p className="text-xs text-muted-foreground mt-1">
                Entering bills before master data is defined leads to orphan records that
                won't roll up into P&amp;L. Complete these steps once — every expense flows
                from them.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Link to="/expenses/categories">
                  <Button size="sm" variant={masterCounts?.categories === 0 ? "default" : "outline"} className="h-8">
                    {masterCounts?.categories === 0 ? "Add categories" : `Categories · ${masterCounts?.categories}`}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
                <Link to="/expenses/vendors">
                  <Button size="sm" variant={masterCounts?.vendors === 0 ? "default" : "outline"} className="h-8">
                    {masterCounts?.vendors === 0 ? "Add vendors" : `Vendors · ${masterCounts?.vendors}`}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
                <Link to="/expenses/payment-terms">
                  <Button size="sm" variant="outline" className="h-8">
                    {masterCounts?.terms === 0 ? "Add payment terms" : `Payment terms · ${masterCounts?.terms}`}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current">This month</SelectItem>
            <SelectItem value="prev">Previous month</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
          </SelectContent>
        </Select>
        <ScopeLine>
          {periodLabel} · {fmtDate(periodStart)} → {fmtDate(periodEnd)}
        </ScopeLine>
      </div>

      {anyLoading && bills.length === 0 ? (
        <KpiSkeleton count={8} />
      ) : (
        <KpiGrid>
          <KpiCard label="Actual (posted)" value={fmtHKWhole(kpis.actual)} hint="In the ledger" tone="success" />
          <KpiCard label="Approved · unposted" value={fmtHKWhole(kpis.approvedUnposted)} hint="Ready to post" tone={kpis.approvedUnposted > 0 ? "info" : "default"} />
          <KpiCard label="Pending" value={fmtHKWhole(kpis.pending)} hint="Awaiting approval" tone={kpis.pending > 0 ? "warning" : "default"} />
          <KpiCard label="Expected" value={fmtHKWhole(kpis.expected)} hint="Recurring not yet generated" tone="info" />
          <KpiCard label="Overdue" value={String(kpis.overdue)} tone={kpis.overdue > 0 ? "destructive" : "default"} />
          <KpiCard label="Needs review" value={String(kpis.needsReview)} tone={kpis.needsReview > 0 ? "warning" : "default"} />
          <KpiCard label="Bank-detected" value={String(kpis.bankDetected)} hint="Unposted" tone={kpis.bankDetected > 0 ? "info" : "default"} />
          <KpiCard label="Late fees" value={fmtHKWhole(kpis.lateFees)} tone={kpis.lateFees > 0 ? "warning" : "default"} />
        </KpiGrid>
      )}

      <Card className="card-glass p-0 overflow-hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="px-4 pt-3 border-b border-border overflow-x-auto">
            <TabsList>
              <TabsTrigger value="all">All ({unified.length})</TabsTrigger>
              <TabsTrigger value="bills">Scanned & Manual</TabsTrigger>
              <TabsTrigger value="recurring-bills">Recurring Generated</TabsTrigger>
              <TabsTrigger value="statements">Statements</TabsTrigger>
              <TabsTrigger value="bank">Bank-Detected</TabsTrigger>
              <TabsTrigger value="rules">Recurring Rules ({rules.length})</TabsTrigger>
              <TabsTrigger value="review">Pending ({kpis.needsReview})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({kpis.overdue})</TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 pt-3 pb-1">
            <ScopeLine>
              Showing {tab === "rules" ? rules.length : filtered.length} record{(tab === "rules" ? rules.length : filtered.length) === 1 ? "" : "s"}
              {tab !== "all" && ` · filter: ${tab}`}
            </ScopeLine>
          </div>

          <TabsContent value={tab} className="m-0">
            {anyLoading && !bills.length ? (
              <TableSkeleton rows={6} cols={tab === "rules" ? 7 : 9} />
            ) : tab === "rules" ? (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Cadence</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Next Generation</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.vendor_name || "—"}</TableCell>
                        <TableCell>{r.cadence}</TableCell>
                        <TableCell>{fmtDate(r.effective_from)}</TableCell>
                        <TableCell>{fmtDate(r.next_generation_date)}</TableCell>
                        <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHKWhole(r.expected_amount)}</TableCell>
                        <TableCell>
                          <StatusPill variant={r.status === "active" ? "success" : "muted"}>
                            {r.status || (r.active ? "active" : "paused")}
                          </StatusPill>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!rules.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState
                            icon={<Sparkles className="h-5 w-5" />}
                            title="No recurring rules yet"
                            description="Set up rules for rent, utilities, subscriptions — bills generate automatically each period."
                            action={
                              <Link to="/expenses/recurring">
                                <Button size="sm" className="h-8">Add a recurring rule</Button>
                              </Link>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recognition</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Vendor / Description</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Doc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                        <TableCell>
                          <StatusPill variant="neutral">
                            {r.source === "recurring" ? "recurring" : r.source}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate">{r.vendor}</TableCell>
                        <TableCell>{r.venue}</TableCell>
                        <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHKWhole(r.amount)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.due)}</TableCell>
                        <TableCell>
                          <StatusPill variant={paymentVariant(r.payment_status)}>
                            {PAYMENT_LABEL[r.payment_status] || r.payment_status}
                          </StatusPill>
                        </TableCell>
                        <TableCell>
                          <StatusPill variant={approvalVariant(r.approval_status)}>
                            {APPROVAL_LABEL[r.approval_status] || r.approval_status}
                          </StatusPill>
                        </TableCell>
                        <TableCell>
                          {r.attachment_url ? (
                            <a
                              href={r.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-primary hover:underline"
                              title="View attached document"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filtered.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0">
                          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                            <div className="text-sm font-medium">No records in this view</div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Try a different tab, or create a new expense.
                            </p>
                            <Link to="/expenses/bills">
                              <Button size="sm" className="h-8 mt-3"><Plus className="h-3 w-3 mr-1" /> New expense</Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
