import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Landmark } from "lucide-react";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import {
  PageHeader,
  StatusPill,
  TableSkeleton,
  EmptyState,
  fmtHK,
  fmtDate,
  ScopeLine,
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
      // Server-side tenant filter (defence-in-depth beyond RLS, avoids over-fetch).
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

  const unpostedCount = txns.filter((t) => !t.expense_posted_bill_id).length;

  const postDirect = async (t: Txn) => {
    if (!tenantId) return;
    if (!confirm(`Post ${fmtHK(Math.abs(t.amount))} directly as bank expense?`)) return;
    const { data, error } = await supabase
      .from("expense_bills")
      .insert({
        tenant_id: tenantId,
        vendor_name: t.description || "Bank charge",
        bill_date: t.transaction_date,
        total_amount: Math.abs(Number(t.amount || 0)),
        subtotal: Math.abs(Number(t.amount || 0)),
        currency: "HKD",
        approval_status: "posted",
        payment_status: "paid",
        paid_amount: Math.abs(Number(t.amount || 0)),
        notes: "Auto-posted from bank-detected expense",
      })
      .select("id")
      .single();
    if (error) {
      toast.error("Post failed: " + error.message);
      return;
    }
    await supabase
      .from("bank_transactions")
      .update({ expense_posted_bill_id: data.id })
      .eq("id", t.id)
      .eq("tenant_id", tenantId);
    toast.success("Posted to bank expense");
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Bank-Detected Expenses"
        description="Expenses pulled from the bank statement that bypass Accounts Payable (already deducted from bank)."
      />

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
          {filtered.length} shown · {unpostedCount} unposted
        </ScopeLine>
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <div className="overflow-auto">
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
                        <Button size="sm" variant="outline" className="h-8" onClick={() => postDirect(t)}>
                          Post to expense
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
        )}
      </Card>
    </div>
  );
}
