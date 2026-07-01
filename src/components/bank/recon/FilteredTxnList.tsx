import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/salesUtils";
import type { BankTxn, BankAccount } from "@/hooks/useBankReconciliation";
import { SUGGESTED_TYPE_LABEL } from "@/utils/bankTxnRules";

export function FilteredTxnList({
  title, emptyMessage, txns, accounts, onOpen, extraNote,
}: {
  title: string;
  emptyMessage: string;
  txns: BankTxn[];
  accounts: BankAccount[];
  onOpen: (t: BankTxn) => void;
  extraNote?: string;
}) {
  return (
    <Card className="card-glass">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        {extraNote && <p className="text-xs text-muted-foreground mb-2">{extraNote}</p>}
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">Date</th>
              <th className="text-left py-2 px-2">Account</th>
              <th className="text-left py-2 px-2">Description</th>
              <th className="text-left py-2 px-2">Suggested</th>
              <th className="text-right py-2 px-2">In</th>
              <th className="text-right py-2 px-2">Out</th>
              <th className="text-left py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">{emptyMessage}</td></tr>}
            {txns.map((t) => {
              const acct = accounts.find((a) => a.id === t.bank_account_id);
              const sugg = (t as any).suggested_type as string | null;
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-card/50 cursor-pointer" onClick={() => onOpen(t)}>
                  <td className="py-2 px-2">{t.txn_date}</td>
                  <td className="py-2 px-2 text-xs">{acct?.account_name || "—"}</td>
                  <td className="py-2 px-2 text-xs truncate max-w-[280px]">{t.description}</td>
                  <td className="py-2 px-2 text-xs">{sugg ? SUGGESTED_TYPE_LABEL[sugg] || sugg : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 px-2 text-right td-num text-emerald-400">{Number(t.money_in) > 0 ? formatCurrency(Number(t.money_in)) : ""}</td>
                  <td className="py-2 px-2 text-right td-num text-rose-400">{Number(t.money_out) > 0 ? formatCurrency(Number(t.money_out)) : ""}</td>
                  <td className="py-2 px-2"><span className="chip chip-neutral">{t.status.replace(/_/g, " ")}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
