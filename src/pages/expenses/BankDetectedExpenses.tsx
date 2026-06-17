import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search } from "lucide-react";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

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
  const [txns, setTxns] = useState<Txn[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows(
        "bank_transactions",
        "id,transaction_date,description,amount,category,bank_account_id,expense_posted_bill_id",
        { col: "transaction_date", asc: false }
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
  }, []);

  const filtered = useMemo(
    () =>
      txns.filter((t) =>
        search ? (t.description || "").toLowerCase().includes(search.toLowerCase()) : true
      ),
    [txns, search]
  );

  const postDirect = async (t: Txn) => {
    if (!confirm(`Post ${fmt(Math.abs(t.amount))} directly as bank expense?`)) return;
    // Create a minimal expense_bill flagged as posted-from-bank, then link.
    const { data, error } = await supabase
      .from("expense_bills")
      .insert({
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
      .eq("id", t.id);
    toast.success("Posted to bank expense");
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Bank-Detected Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Expenses pulled from the bank statement that bypass Accounts Payable (already deducted from bank).
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow key={t.id}>
                <TableCell>{dt(t.transaction_date)}</TableCell>
                <TableCell className="max-w-[420px] truncate">{t.description}</TableCell>
                <TableCell>{t.category || "—"}</TableCell>
                <TableCell className="text-right td-num">{fmt(Math.abs(Number(t.amount || 0)))}</TableCell>
                <TableCell>
                  {t.expense_posted_bill_id ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Posted</Badge>
                  ) : (
                    <Badge variant="outline">Unposted</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!t.expense_posted_bill_id && (
                    <Button size="sm" variant="outline" onClick={() => postDirect(t)}>
                      Post to Expense
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No bank-detected expenses"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
