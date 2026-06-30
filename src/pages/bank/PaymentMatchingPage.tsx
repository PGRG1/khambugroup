import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useBankModule, type BankTxn } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Search, Link2, Trash2 } from "lucide-react";

type OpenDoc = {
  id: string;
  source: "supplier_invoice" | "expense_bill";
  reference: string;
  vendor: string;
  date: string;
  amount: number;
  paid: number;
  remaining: number;
  currency: string;
};

export default function PaymentMatchingPage() {
  const { accounts, transactions, matches, createMatch, deleteMatch } = useBankModule();
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<BankTxn | null>(null);
  const [docQ, setDocQ] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const [inv, bills, sups] = await Promise.all([
        fetchAllRows("invoices", "id, invoice_number, invoice_date, total_amount, amount_paid, supplier_id"),
        fetchAllRows("expense_bills", "id, bill_number, bill_date, total_amount, paid_amount, vendor_name, supplier_id, currency"),
        fetchAllRows("suppliers", "id, name"),
      ]);
      const supMap = new Map((sups as any[]).map((s: any) => [s.id, s.name]));
      const a: OpenDoc[] = (inv as any[]).map((r) => ({
        id: r.id, source: "supplier_invoice", reference: r.invoice_number,
        vendor: supMap.get(r.supplier_id) || "—", date: r.invoice_date,
        amount: Number(r.total_amount), paid: Number(r.amount_paid),
        remaining: Number(r.total_amount) - Number(r.amount_paid), currency: "HKD",
      })).filter((d) => d.remaining > 0.01);
      const b: OpenDoc[] = (bills as any[]).map((r) => ({
        id: r.id, source: "expense_bill", reference: r.bill_number || "(no #)",
        vendor: r.vendor_name || supMap.get(r.supplier_id) || "—", date: r.bill_date,
        amount: Number(r.total_amount), paid: Number(r.paid_amount),
        remaining: Number(r.total_amount) - Number(r.paid_amount), currency: r.currency || "HKD",
      })).filter((d) => d.remaining > 0.01);
      setOpenDocs([...a, ...b].sort((x, y) => (x.date < y.date ? 1 : -1)));
    })();
  }, []);

  const filteredTxns = useMemo(() => {
    return transactions.filter((t) => {
      if (t.matched_record_id) return false;
      if (direction === "in" && !t.money_in) return false;
      if (direction === "out" && !t.money_out) return false;
      if (confidenceFilter !== "all" && (t.match_confidence || "none") !== confidenceFilter) return false;
      return true;
    });
  }, [transactions, direction, confidenceFilter]);

  const filteredDocs = useMemo(() => {
    if (!docQ) return openDocs;
    const q = docQ.toLowerCase();
    return openDocs.filter((d) => d.reference?.toLowerCase().includes(q) || d.vendor?.toLowerCase().includes(q));
  }, [openDocs, docQ]);

  const txnMatches = (txnId: string) => matches.filter((m: any) => m.txn_id === txnId);

  const link = async (doc: OpenDoc) => {
    if (!selectedTxn) return;
    try {
      const amount = Number(selectedTxn.money_out || selectedTxn.money_in || 0);
      await createMatch(selectedTxn.id, doc.source, doc.id, amount, "high");
      toast.success("Matched");
      setSelectedTxn(null);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <BankPageShell
      title="Payment Matching"
      description="Match bank transactions to supplier invoices, expense bills, payroll, and other accounting records. Supports 1-to-many and many-to-one matching."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Unmatched txns" value={transactions.filter((t) => !t.matched_record_id).length} />
        <BankKpi label="Open invoices/bills" value={openDocs.length} />
        <BankKpi label="High confidence" value={transactions.filter((t) => t.match_confidence === "high" && !t.matched_record_id).length} tone="success" />
        <BankKpi label="Low confidence" value={transactions.filter((t) => t.match_confidence === "low").length} tone="warn" />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in">Money in</SelectItem>
            <SelectItem value="out">Money out</SelectItem>
          </SelectContent>
        </Select>
        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Confidence" /></SelectTrigger>
          <SelectContent>
            {["all","high","medium","low","none"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-semibold mb-3">Unmatched bank transactions <Badge variant="outline" className="ml-2">{filteredTxns.length}</Badge></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Conf.</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredTxns.slice(0, 200).map((t) => {
                const acct = accounts.find((a) => a.id === t.bank_account_id);
                const amt = Number(t.money_in || 0) - Number(t.money_out || 0);
                return (
                  <TableRow key={t.id}>
                    <TableCell>{fmtDate(t.txn_date)}</TableCell>
                    <TableCell className="truncate max-w-[220px]">{t.description}</TableCell>
                    <TableCell className={`text-right font-mono td-num ${amt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(amt, acct?.currency)}</TableCell>
                    <TableCell>{t.match_confidence ? <Badge variant="outline">{t.match_confidence}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setSelectedTxn(t)}>Match</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Existing matches <Badge variant="outline" className="ml-2">{matches.length}</Badge></div>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Txn</TableHead><TableHead>Matched to</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {matches.slice(0, 100).map((m: any) => {
                const t = transactions.find((x) => x.id === m.txn_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="truncate max-w-[200px]">{t ? `${fmtDate(t.txn_date)} ${t.description}` : "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{m.matched_type}</Badge> <span className="text-xs text-muted-foreground font-mono">{String(m.matched_id).slice(0, 8)}</span></TableCell>
                    <TableCell className="text-right font-mono td-num">{fmtMoney(m.amount)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteMatch(m.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button></TableCell>
                  </TableRow>
                );
              })}
              {!matches.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No matches yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Sheet open={!!selectedTxn} onOpenChange={(o) => !o && setSelectedTxn(null)}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader><SheetTitle>Match transaction to document(s)</SheetTitle></SheetHeader>
          {selectedTxn && (
            <div className="py-4 space-y-3">
              <Card className="p-3 bg-accent/30">
                <div className="text-sm text-muted-foreground">{fmtDate(selectedTxn.txn_date)}</div>
                <div className="font-medium">{selectedTxn.description}</div>
                <div className="text-sm">
                  {selectedTxn.money_in ? <span className="text-emerald-600">+{fmtMoney(selectedTxn.money_in)}</span> : null}
                  {selectedTxn.money_out ? <span className="text-rose-600">−{fmtMoney(selectedTxn.money_out)}</span> : null}
                </div>
                {txnMatches(selectedTxn.id).length > 0 && (
                  <div className="mt-2 text-xs">
                    Already linked to:&nbsp;
                    {txnMatches(selectedTxn.id).map((m: any) => (
                      <Badge key={m.id} variant="outline" className="mr-1">{m.matched_type} · {fmtMoney(m.amount)}</Badge>
                    ))}
                  </div>
                )}
              </Card>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7" placeholder="Search invoice/bill #, vendor…" value={docQ} onChange={(e) => setDocQ(e.target.value)} />
              </div>

              <div className="border rounded max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Source</TableHead><TableHead>Ref</TableHead><TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredDocs.slice(0, 150).map((d) => (
                      <TableRow key={`${d.source}:${d.id}`}>
                        <TableCell>{fmtDate(d.date)}</TableCell>
                        <TableCell><Badge variant="secondary">{d.source === "supplier_invoice" ? "Invoice" : "Bill"}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{d.reference}</TableCell>
                        <TableCell className="truncate max-w-[160px]">{d.vendor}</TableCell>
                        <TableCell className="text-right font-mono td-num">{fmtMoney(d.remaining, d.currency)}</TableCell>
                        <TableCell><Button size="sm" variant="outline" onClick={() => link(d)}><Link2 className="h-3.5 w-3.5 mr-1" />Link</Button></TableCell>
                      </TableRow>
                    ))}
                    {!filteredDocs.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No open documents</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <SheetFooter>
            <Button variant="outline" onClick={() => setSelectedTxn(null)}>Close</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </BankPageShell>
  );
}
