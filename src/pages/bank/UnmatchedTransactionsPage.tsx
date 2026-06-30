import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBankModule } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { toast } from "sonner";

const REASONS = ["all", "no_suggestion", "low_confidence", "missing_doc", "outstanding"];

export default function UnmatchedTransactionsPage() {
  const { accounts, transactions, classify, updateTxn } = useBankModule();
  const [q, setQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [acctFilter, setAcctFilter] = useState("all");

  const enriched = useMemo(() => {
    return transactions
      .filter((t) => !t.matched_record_id)
      .map((t) => {
        const cls = classify(t);
        const hasDoc = (t.attachment_urls?.length || 0) > 0;
        let reason: string;
        if (t.match_confidence === "low") reason = "low_confidence";
        else if (!cls) reason = "no_suggestion";
        else if (!hasDoc) reason = "missing_doc";
        else reason = "outstanding";
        return { t, cls, reason, hasDoc };
      });
  }, [transactions, classify]);

  const filtered = enriched.filter(({ t, reason }) => {
    if (reasonFilter !== "all" && reason !== reasonFilter) return false;
    if (acctFilter !== "all" && t.bank_account_id !== acctFilter) return false;
    if (q && !(t.description || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { no_suggestion: 0, low_confidence: 0, missing_doc: 0, outstanding: 0 };
    for (const e of enriched) c[e.reason] = (c[e.reason] || 0) + 1;
    return c;
  }, [enriched]);

  return (
    <BankPageShell
      title="Unmatched Transactions"
      description="Everything still requiring action — quickly match, categorise, document or approve."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="No suggested match" value={counts.no_suggestion || 0} tone="warn" />
        <BankKpi label="Low confidence" value={counts.low_confidence || 0} tone="danger" />
        <BankKpi label="Missing document" value={counts.missing_doc || 0} />
        <BankKpi label="Other outstanding" value={counts.outstanding || 0} />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7 w-64" placeholder="Search description" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={acctFilter} onValueChange={setAcctFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead><TableHead>Reason</TableHead><TableHead>Suggested</TableHead>
            <TableHead className="text-right">Quick actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.slice(0, 500).map(({ t, cls, reason }) => {
              const acct = accounts.find((a) => a.id === t.bank_account_id);
              const amt = Number(t.money_in || 0) - Number(t.money_out || 0);
              return (
                <TableRow key={t.id}>
                  <TableCell>{fmtDate(t.txn_date)}</TableCell>
                  <TableCell className="truncate max-w-[140px]">{acct?.account_name}</TableCell>
                  <TableCell className="truncate max-w-[280px]">{t.description}</TableCell>
                  <TableCell className={`text-right font-mono td-num ${amt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(amt, acct?.currency)}</TableCell>
                  <TableCell><Badge variant="outline">{reason}</Badge></TableCell>
                  <TableCell>{cls?.suggested_type ? <Badge variant="secondary">{cls.suggested_type}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/bank/matching`}>Match</Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try { await updateTxn(t.id, { status: "approved" }); toast.success("Approved"); }
                      catch (e: any) { toast.error(e.message); }
                    }}>Approve</Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">All caught up 🎉</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </BankPageShell>
  );
}
