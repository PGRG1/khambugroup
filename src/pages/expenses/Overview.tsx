import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, FileStack, Landmark, Repeat, AlertCircle, Paperclip } from "lucide-react";
import { useExpenseBills, ExpenseBill } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import { useRecurringExpenses } from "@/hooks/useRecurringExpenses";
import { fetchAllRows } from "@/utils/fetchAllRows";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// Recognition date used for monthly reporting (period_start for recurring bills,
// service_period_start for manual, falling back to bill_date).
const recognitionDate = (b: ExpenseBill): string =>
  (b.period_start as string) || (b.service_period_start as string) || b.bill_date;

interface UnifiedRow {
  id: string;
  date: string; // recognition date
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
  const { bills, loading: bLoad } = useExpenseBills();
  const { statements, loading: sLoad } = useVendorStatements();
  const { rules, loading: rLoad } = useRecurringExpenses();
  const [bankExpenses, setBankExpenses] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchAllRows(
          "bank_transactions",
          "id,transaction_date,description,amount,category,bank_account_id,expense_posted_bill_id",
          { col: "transaction_date", asc: false }
        );
        setBankExpenses(
          (rows as any[]).filter((r) => Number(r.amount) < 0 || /charge|fee|interest|debit/i.test(r.description || ""))
        );
      } catch {
        setBankExpenses([]);
      }
    })();
  }, []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  // Per-bill recognition date drives MTD bucketing
  const kpis = useMemo(() => {
    const inMonth = (d: string) => d >= monthStart && d <= monthEnd;

    const billsMTD = bills.filter((b) => inMonth(recognitionDate(b)));
    const actualMTD = billsMTD
      .filter((b) => b.approval_status === "posted" || b.approval_status === "approved")
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const pendingMTD = billsMTD
      .filter((b) => b.approval_status === "draft" || b.approval_status === "pending_review")
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);

    // Expected = active rules whose next_generation_date falls in current month
    // and which haven't yet produced a bill for that period.
    const expectedMTD = rules
      .filter(
        (r) =>
          r.status === "active" &&
          r.next_generation_date &&
          r.next_generation_date >= monthStart &&
          r.next_generation_date <= monthEnd
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

    return { actualMTD, pendingMTD, expectedMTD, overdue, needsReview, lateFees, bankDetected };
  }, [bills, statements, rules, bankExpenses, monthStart, monthEnd, today]);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Control centre for all non-inventory costs. Monthly figures use the
            expense recognition date.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/expenses/bills"><Button><Plus className="h-4 w-4 mr-1" /> New Expense</Button></Link>
          <Link to="/expenses/bills"><Button variant="outline"><Upload className="h-4 w-4 mr-1" /> Upload Bill</Button></Link>
          <Link to="/expenses/statements"><Button variant="outline"><FileStack className="h-4 w-4 mr-1" /> Upload Statement</Button></Link>
          <Link to="/expenses/bank-detected"><Button variant="outline"><Landmark className="h-4 w-4 mr-1" /> Review Bank-Detected</Button></Link>
          <Link to="/expenses/recurring"><Button variant="outline"><Repeat className="h-4 w-4 mr-1" /> Recurring Rules</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: "Actual (MTD)", value: fmt(kpis.actualMTD), hint: "Approved & posted" },
          { label: "Pending (MTD)", value: fmt(kpis.pendingMTD), hint: "Awaiting approval" },
          { label: "Expected (MTD)", value: fmt(kpis.expectedMTD), hint: "Recurring not yet generated" },
          { label: "Overdue", value: String(kpis.overdue) },
          { label: "Needs Review", value: String(kpis.needsReview) },
          { label: "Bank-Detected", value: String(kpis.bankDetected) },
          { label: "Late Fees", value: fmt(kpis.lateFees) },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="text-xl font-semibold mt-1 td-num">{k.value}</div>
            {k.hint && <div className="text-[10px] text-muted-foreground mt-0.5">{k.hint}</div>}
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="px-4 pt-3 border-b border-border overflow-x-auto">
            <TabsList>
              <TabsTrigger value="all">All Expenses ({unified.length})</TabsTrigger>
              <TabsTrigger value="bills">Scanned & Manual</TabsTrigger>
              <TabsTrigger value="recurring-bills">Recurring Generated</TabsTrigger>
              <TabsTrigger value="statements">Statements</TabsTrigger>
              <TabsTrigger value="bank">Bank-Detected</TabsTrigger>
              <TabsTrigger value="rules">Recurring Rules ({rules.length})</TabsTrigger>
              <TabsTrigger value="review">Pending Approval ({kpis.needsReview})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({kpis.overdue})</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={tab} className="m-0">
            {tab === "rules" ? (
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
                      <TableCell>{dt(r.effective_from)}</TableCell>
                      <TableCell>{dt(r.next_generation_date)}</TableCell>
                      <TableCell className="text-right td-num">{fmt(r.expected_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : "secondary"}>
                          {r.status || (r.active ? "active" : "paused")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rules.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {rLoad ? "Loading…" : "No recurring rules"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
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
                      <TableCell>{dt(r.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {r.source === "recurring" ? "recurring" : r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate">{r.vendor}</TableCell>
                      <TableCell>{r.venue}</TableCell>
                      <TableCell className="text-right td-num">{fmt(r.amount)}</TableCell>
                      <TableCell>{dt(r.due)}</TableCell>
                      <TableCell><Badge variant="outline">{r.payment_status}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{r.approval_status}</Badge></TableCell>
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
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {bLoad || sLoad || rLoad ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Loading data…
        </p>
      ) : null}
    </div>
  );
}
