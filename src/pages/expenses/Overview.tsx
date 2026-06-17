import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, FileStack, Landmark, Repeat, ScanLine, FileText, AlertCircle } from "lucide-react";
import { useExpenseBills } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import { useRecurringExpenses } from "@/hooks/useRecurringExpenses";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

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
        // bank-detected expenses = debits (outflow) tagged or unlinked
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
  const today = now.toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    const billsMTD = bills.filter((b) => b.bill_date >= monthStart);
    const totalMTD =
      billsMTD.reduce((s, b) => s + Number(b.total_amount || 0), 0) +
      statements
        .filter((s) => s.statement_date >= monthStart)
        .reduce((s, x) => s + Number(x.current_period_charges || 0) + Number(x.late_fees || 0), 0);
    const billsToPay = bills.filter((b) => b.payment_status !== "paid").reduce((s, b) => s + (Number(b.total_amount) - Number(b.paid_amount || 0)), 0);
    const overdue = bills.filter((b) => b.due_date && b.due_date < today && b.payment_status !== "paid").length;
    const paid = bills.filter((b) => b.payment_status === "paid").length;
    const bankDetected = bankExpenses.filter((b) => !b.expense_posted_bill_id).length;
    const needsReview = bills.filter((b) => b.approval_status === "pending_review").length + statements.filter((s) => s.approval_status === "pending_review").length;
    const lateFees = statements.reduce((s, x) => s + Number(x.late_fees || 0), 0);
    return { totalMTD, billsToPay, overdue, paid, bankDetected, needsReview, lateFees };
  }, [bills, statements, bankExpenses, monthStart, today]);

  const unified: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    bills.forEach((b) =>
      rows.push({
        id: `b-${b.id}`,
        date: b.bill_date,
        source: "bill",
        vendor: b.vendor_name || "—",
        category: "—",
        venue: b.venue || "—",
        amount: Number(b.total_amount || 0),
        due: b.due_date,
        payment_status: b.payment_status,
        approval_status: b.approval_status,
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
      case "statements":
        return unified.filter((r) => r.source === "statement");
      case "bank":
        return unified.filter((r) => r.source === "bank");
      case "recurring":
        return []; // recurring shown as separate count below
      case "review":
        return unified.filter((r) => r.approval_status === "pending_review");
      case "overdue":
        return unified.filter((r) => r.due && r.due < today && r.payment_status !== "paid");
      default:
        return unified;
    }
  }, [tab, unified, today]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Control centre for all non-inventory costs.</p>
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
          { label: "Total This Month", value: fmt(kpis.totalMTD) },
          { label: "Bills To Pay", value: fmt(kpis.billsToPay) },
          { label: "Overdue", value: String(kpis.overdue) },
          { label: "Paid (count)", value: String(kpis.paid) },
          { label: "Bank-Detected", value: String(kpis.bankDetected) },
          { label: "Needs Review", value: String(kpis.needsReview) },
          { label: "Late Fees (avoidable)", value: fmt(kpis.lateFees) },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="text-xl font-semibold mt-1 td-num">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="px-4 pt-3 border-b border-border">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="bills">Bills</TabsTrigger>
              <TabsTrigger value="statements">Statements</TabsTrigger>
              <TabsTrigger value="bank">Bank-Detected</TabsTrigger>
              <TabsTrigger value="recurring">Recurring ({rules.length})</TabsTrigger>
              <TabsTrigger value="review">Needs Review ({kpis.needsReview})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({kpis.overdue})</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={tab} className="m-0">
            {tab === "recurring" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.vendor_name || "—"}</TableCell>
                      <TableCell>{r.cadence}</TableCell>
                      <TableCell>{dt(r.next_due_date)}</TableCell>
                      <TableCell className="text-right td-num">{fmt(r.expected_amount)}</TableCell>
                      <TableCell><Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Active" : "Paused"}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {!rules.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No recurring rules</TableCell></TableRow>}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Vendor / Description</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{dt(r.date)}</TableCell>
                      <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                      <TableCell className="max-w-[320px] truncate">{r.vendor}</TableCell>
                      <TableCell>{r.venue}</TableCell>
                      <TableCell className="text-right td-num">{fmt(r.amount)}</TableCell>
                      <TableCell>{dt(r.due)}</TableCell>
                      <TableCell><Badge variant="outline">{r.payment_status}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{r.approval_status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
        <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Loading data…</p>
      ) : null}
    </div>
  );
}
