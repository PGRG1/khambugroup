import { useMemo } from "react";
import { ChartAccount, AccountType } from "@/hooks/useChartOfAccounts";
import { useAccountMapping } from "@/hooks/useAccountMapping";
import { useVenues } from "@/hooks/useVenues";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, AlertCircle, Info } from "lucide-react";

const SALES_ROWS: Array<{
  rule_type: string;
  label: string;
  description: string;
  allowedTypes: AccountType[];
}> = [
  { rule_type: "sales_revenue",  label: "Sales (Subtotal)", description: "Net food & beverage revenue",            allowedTypes: ["revenue"] },
  { rule_type: "service_charge", label: "Service Charge",   description: "Service fees on top of sales",           allowedTypes: ["revenue"] },
  { rule_type: "sales_discount", label: "Discount (−)",     description: "Discounts given (contra-revenue)",       allowedTypes: ["revenue"] },
  { rule_type: "tips_payable",   label: "Tips (Balance Sheet)", description: "Tips owed to staff — liability",     allowedTypes: ["liability"] },
];

// Payment side: one row per "where the money lands", per venue.
// All non-cash methods share a single per-venue Payment Settlement Clearing account.
const PAYMENT_ROWS: Array<{
  rule_type: "cash_on_hand" | "payment_settlement_clearing";
  label: string;
  description: string;
}> = [
  {
    rule_type: "cash_on_hand",
    label: "Cash on Hand",
    description: "Physical cash collected at the venue. Cash sales debit this account.",
  },
  {
    rule_type: "payment_settlement_clearing",
    label: "Payment Settlement Clearing",
    description:
      "All non-cash methods (Visa, Mastercard, Amex, UnionPay, JCB, Alipay, WeChat, PayMe, Octopus, …) debit this single per-venue account. Each method stays on its own journal line for reconciliation. Cleared later from bank/processor settlements.",
  },
];

export function RevenueMappingMatrix({ accounts, section = "all" }: { accounts: ChartAccount[]; section?: "sales" | "payments" | "all" }) {
  const { items, upsert } = useAccountMapping();
  const { venues } = useVenues();

  const activeVenues = useMemo(
    () => venues.filter((v) => v.is_active).map((v) => v.name),
    [venues],
  );

  const lookup = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((r) => m.set(`${r.rule_type}|${r.match_key}`, r.account_id));
    return m;
  }, [items]);

  const accountsByType = useMemo(() => {
    const m = new Map<AccountType, ChartAccount[]>();
    accounts.filter((a) => a.is_active).forEach((a) => {
      if (!m.has(a.account_type)) m.set(a.account_type, []);
      m.get(a.account_type)!.push(a);
    });
    return m;
  }, [accounts]);

  const accountsForRow = (allowed: AccountType[]) => allowed.flatMap((t) => accountsByType.get(t) ?? []);
  const paymentAccounts = accountsByType.get("asset") ?? [];

  const handleChange = (rule_type: string, match_key: string, account_id: string) => {
    upsert({ rule_type, match_key, account_id });
  };

  const showSales = section === "all" || section === "sales";
  const showPayments = section === "all" || section === "payments";
  const showPreview = section === "all";

  return (
    <div className="space-y-6">
      {section === "all" && (
        <p className="text-sm text-muted-foreground max-w-3xl">
          These rules tell the system how each line on a sales receipt flows into the books.
          Pick a Chart of Accounts entry for every venue below — changes save automatically.
        </p>
      )}

      {/* SALES SIDE */}
      {showSales && (
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Sales side</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per venue — revenue, service charge, discount and tips post to these accounts.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                <th className="px-4 py-2.5 font-medium w-[260px]">Receipt field</th>
                {activeVenues.map((v) => (
                  <th key={v} className="px-3 py-2.5 font-medium">{v}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {SALES_ROWS.map((row) => {
                const eligible = accountsForRow(row.allowedTypes);
                return (
                  <tr key={row.rule_type} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm font-medium">{row.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{row.description}</div>
                    </td>
                    {activeVenues.map((venue) => {
                      const current = lookup.get(`${row.rule_type}|${venue}`) ?? "";
                      const isMapped = !!current;
                      return (
                        <td key={venue} className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Select value={current || undefined} onValueChange={(v) => handleChange(row.rule_type, venue, v)}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select account…" />
                              </SelectTrigger>
                              <SelectContent>
                                {eligible.map((a) => (
                                  <SelectItem key={a.id} value={a.id} className="text-xs">
                                    <span className="font-mono text-muted-foreground mr-2">{a.code}</span>
                                    {a.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isMapped ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {/* PAYMENT SIDE */}
      {showPayments && (
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Payment side</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per venue — Cash debits <span className="font-medium">Cash on Hand</span>;
            every non-cash method debits the same <span className="font-medium">Payment Settlement Clearing</span> account.
          </p>
        </div>
        <div className="px-4 py-2.5 border-b border-border/40 bg-sky-500/5 flex items-start gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 text-sky-500 shrink-0" />
          <span>
            Processor identification (KPAY vs. the other processor) is not assumed at journal time — it happens later
            during bank / settlement reconciliation. Each payment method still appears as its own line under the clearing account.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                <th className="px-4 py-2.5 font-medium w-[260px]">Lands in</th>
                {activeVenues.map((v) => (
                  <th key={v} className="px-3 py-2.5 font-medium">{v}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {PAYMENT_ROWS.map((row) => (
                <tr key={row.rule_type} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{row.description}</div>
                  </td>
                  {activeVenues.map((venue) => {
                    const current = lookup.get(`${row.rule_type}|${venue}`) ?? "";
                    const isMapped = !!current;
                    return (
                      <td key={venue} className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Select value={current || undefined} onValueChange={(v) => handleChange(row.rule_type, venue, v)}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select account…" />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentAccounts.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  <span className="font-mono text-muted-foreground mr-2">{a.code}</span>
                                  {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isMapped ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {/* Posting preview */}
      {showPreview && (
      <Card className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">How a sales day posts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Example for Assembly: cash + four card / e-wallet methods, a small discount, plus service charge.
          Every payment method stays on its own line; non-cash lines all hit the same Payment Settlement Clearing account.
        </p>
        <div className="font-mono text-xs bg-muted/40 rounded p-3 leading-relaxed">
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2 text-muted-foreground border-b border-border/40 pb-1 mb-1">
            <span>Account</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span>Payment method</span>
          </div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Cash on Hand – Assembly</span><span className="text-right">300.00</span><span /><span>Cash</span></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Payment Settlement Clearing – Assembly</span><span className="text-right">400.00</span><span /><span>Visa</span></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Payment Settlement Clearing – Assembly</span><span className="text-right">200.00</span><span /><span>Mastercard</span></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Payment Settlement Clearing – Assembly</span><span className="text-right">100.00</span><span /><span>Amex</span></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Payment Settlement Clearing – Assembly</span><span className="text-right">150.00</span><span /><span>Alipay</span></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Sales Discounts – Assembly</span><span className="text-right">50.00</span><span /><span /></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Sales – Assembly</span><span /><span className="text-right">1,100.00</span><span /></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2"><span>Service Charge – Assembly</span><span /><span className="text-right">100.00</span><span /></div>
          <div className="grid grid-cols-[1fr_90px_90px_140px] gap-2 border-t border-border/40 mt-1 pt-1 font-semibold">
            <span>Total</span><span className="text-right">1,200.00</span><span className="text-right">1,200.00</span><span />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Each non-cash line shares the same account but keeps its own payment-method tag, so the
            clearing balance can be matched line-by-line to bank or processor settlements later.
          </div>
        </div>
      </Card>
      )}
    </div>
  );
}
