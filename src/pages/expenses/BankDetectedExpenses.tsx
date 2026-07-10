import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Search, Landmark, ArrowRight } from "lucide-react";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import {
  PageHeader,
  StatusPill,
  TableSkeleton,
  EmptyState,
  fmtHK,
  fmtHKWhole,
  fmtDate,
  ScopeLine,
  KpiGrid,
  KpiCard,
  KpiSkeleton,
} from "@/components/expenses/shared";

interface Txn {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  category: string | null;
  bank_account_id: string | null;
  expense_posted_bill_id: string | null;
}

export default function BankDetectedExpenses() {
  const { tenantId } = useActiveTenant();
  const navigate = useNavigate();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantId) {
      setTxns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchAllRows(
        "bank_transactions",
        "id,transaction_date,description,amount,category,bank_account_id,expense_posted_bill_id",
        { col: "transaction_date", asc: false },
        tenantId
      );
      setTxns(
        (rows as any[]).filter(
          (r) =>
            Number(r.amount) < 0 ||
            /charge|fee|interest|overdraft|debit|direct\s?debit/i.test(r.description || "")
        ) as Txn[]
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filtered = useMemo(
    () =>
      txns.filter((t) =>
        search ? (t.description || "").toLowerCase().includes(search.toLowerCase()) : true
      ),
    [txns, search]
  );

  const kpis = useMemo(() => {
    const unposted = txns.filter((t) => !t.expense_posted_bill_id);
    const unpostedAmt = unposted.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
    const posted = txns.filter((t) => t.expense_posted_bill_id);
    return {
      unpostedCount: unposted.length,
      unpostedAmt,
      postedCount: posted.length,
      totalAmt: txns.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0),
    };
  }, [txns]);

  // Open the bill editor pre-filled from this transaction — the professional path.
  // No more silent orphan "posted" bills: the user reviews, picks category + GL
  // account, and posts through the normal Approve & Post flow.
  const openInBillEditor = (t: Txn) => {
    const amount = Math.abs(Number(t.amount || 0));
    navigate("/expenses/bills", {
      state: {
        prefill: {
          header: {
            vendor_name: t.description || "Bank charge",
            bill_date: t.transaction_date,
            due_date: t.transaction_date,
            currency: "HKD",
            subtotal: amount,
            tax_amount: 0,
            total_amount: amount,
            notes: `From bank transaction on ${t.transaction_date}: ${t.description || ""}`,
            approval_status: "draft",
          },
          allocations: [
            {
              line_no: 1,
              expense_category: null,
              account_id: null,
              venue: null,
              department: null,
              amount,
              tax_treatment: "none" as const,
              tax_amount: 0,
              notes: t.description || null,
            },
          ],
          bankTxnId: t.id,
        },
      },
    });
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Bank-Detected Expenses"
        description="Charges, fees, and direct debits pulled from the bank feed. Review each one in the bill editor to assign a category and GL account before posting."
      />

      {loading && txns.length === 0 ? (
        <KpiSkeleton count={3} />
      ) : (
        <KpiGrid>
          <KpiCard label="Unposted" value={String(kpis.unpostedCount)} hint="Awaiting review" tone={kpis.unpostedCount > 0 ? "warning" : "default"} />
          <KpiCard label="Unposted amount" value={fmtHKWhole(kpis.unpostedAmt)} tone={kpis.unpostedAmt > 0 ? "warning" : "default"} />
          <KpiCard label="Posted" value={String(kpis.postedCount)} tone="info" />
        </KpiGrid>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ScopeLine>
          Showing {filtered.length} of {txns.length} · {kpis.unpostedCount} unposted
        </ScopeLine>
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/20">
                      <TableCell className="whitespace-nowrap">{fmtDate(t.transaction_date)}</TableCell>
                      <TableCell className="max-w-[420px] truncate">{t.description}</TableCell>
                      <TableCell>{t.category || "—"}</TableCell>
                      <TableCell className="text-right td-num tabular-nums whitespace-nowrap">
                        {fmtHK(Math.abs(Number(t.amount || 0)))}
                      </TableCell>
                      <TableCell>
                        <StatusPill variant={t.expense_posted_bill_id ? "success" : "warning"}>
                          {t.expense_posted_bill_id ? "Posted" : "Unposted"}
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        {!t.expense_posted_bill_id && (
                          <Button size="sm" variant="outline" className="h-8 min-h-[36px]" onClick={() => openInBillEditor(t)}>
                            Open in bill editor <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={<Landmark className="h-6 w-6" />}
                          title={search ? "No matches" : "No bank-detected expenses"}
                          description={
                            search
                              ? "Try clearing the search."
                              : "Charges, fees, interest, and direct debits from the bank feed appear here."
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/60">
              {filtered.map((t) => (
                <div key={t.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.description || "—"}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(t.transaction_date)}</div>
                    </div>
                    <div className="text-right td-num tabular-nums whitespace-nowrap font-semibold">
                      {fmtHK(Math.abs(Number(t.amount || 0)))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill variant={t.expense_posted_bill_id ? "success" : "warning"}>
                      {t.expense_posted_bill_id ? "Posted" : "Unposted"}
                    </StatusPill>
                    {!t.expense_posted_bill_id && (
                      <Button size="sm" variant="outline" className="h-11" onClick={() => openInBillEditor(t)}>
                        Open in bill editor <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <EmptyState
                  icon={<Landmark className="h-6 w-6" />}
                  title={search ? "No matches" : "No bank-detected expenses"}
                  description={
                    search
                      ? "Try clearing the search."
                      : "Charges, fees, interest, and direct debits from the bank feed appear here."
                  }
                />
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
