import { useMemo, useState } from "react";
import { useBankModule, type BankTxn } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";

type Mode = "in" | "out";

export function CashFlowList({ mode, title, description, matchTargets }: { mode: Mode; title: string; description: string; matchTargets: string[] }) {
  const { accounts, incoming, outgoing, classify } = useBankModule();
  const list = mode === "in" ? incoming : outgoing;
  const [q, setQ] = useState("");
  const [acctFilter, setAcctFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return list.filter((t) => {
      if (acctFilter !== "all" && t.bank_account_id !== acctFilter) return false;
      if (statusFilter === "matched" && !t.matched_record_id) return false;
      if (statusFilter === "unmatched" && t.matched_record_id) return false;
      if (q && !(t.description || "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [list, q, acctFilter, statusFilter]);

  const total = filtered.reduce((s, t) => s + Number(mode === "in" ? t.money_in : t.money_out) || 0, 0);
  const matched = filtered.filter((t) => t.matched_record_id).length;

  return (
    <BankPageShell title={title} description={description}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label={mode === "in" ? "Total inflow" : "Total outflow"} value={fmtMoney(total)} tone={mode === "in" ? "success" : "danger"} />
        <BankKpi label="Transactions" value={filtered.length} />
        <BankKpi label="Matched" value={matched} />
        <BankKpi label="Match types" value={matchTargets.join(", ")} sub="Available match destinations" />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7 w-64" placeholder="Search description" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={acctFilter} onValueChange={setAcctFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
          </SelectContent>
        </Select>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link to="/bank/matching">Open matching workspace →</Link>
        </Button>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Suggested</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 500).map((t) => {
              const cls = classify(t);
              const acct = accounts.find((a) => a.id === t.bank_account_id);
              const amt = mode === "in" ? t.money_in : t.money_out;
              return (
                <TableRow key={t.id}>
                  <TableCell>{fmtDate(t.txn_date)}</TableCell>
                  <TableCell className="truncate max-w-[160px]">{acct?.account_name}</TableCell>
                  <TableCell className="truncate max-w-[300px]">{t.description}</TableCell>
                  <TableCell>{cls?.suggested_type ? <Badge variant="secondary">{cls.suggested_type}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  <TableCell className={`text-right font-mono td-num ${mode === "in" ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(amt, acct?.currency)}</TableCell>
                  <TableCell><Badge variant={t.matched_record_id ? "default" : "outline"}>{t.matched_record_id ? "matched" : t.status || "imported"}</Badge></TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transactions.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </BankPageShell>
  );
}

export default function IncomingDepositsPage() {
  return (
    <CashFlowList
      mode="in"
      title="Incoming Deposits"
      description="Customer receipts, card processor settlements, refunds and other cash inflows."
      matchTargets={["Revenue", "Card settlement", "AR", "Other receipt"]}
    />
  );
}
