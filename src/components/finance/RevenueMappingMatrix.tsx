import { useMemo } from "react";
import { ChartAccount, AccountType } from "@/hooks/useChartOfAccounts";
import { useAccountMapping } from "@/hooks/useAccountMapping";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, AlertCircle } from "lucide-react";

const VENUES = ["Assembly", "Caliente", "Hanabi", "Events"] as const;

const SALES_ROWS: Array<{
  rule_type: string;
  label: string;
  description: string;
  allowedTypes: AccountType[];
}> = [
  { rule_type: "sales_revenue", label: "Sales (Subtotal)", description: "Net food & beverage revenue", allowedTypes: ["revenue"] },
  { rule_type: "service_charge", label: "Service Charge", description: "Service fees on top of sales", allowedTypes: ["revenue"] },
  { rule_type: "sales_discount", label: "Discount (−)", description: "Discounts given (contra-revenue)", allowedTypes: ["revenue"] },
  { rule_type: "tips_payable", label: "Tips (Balance Sheet)", description: "Tips owed to staff — liability", allowedTypes: ["liability"] },
];

const PAYMENT_ROWS: Array<{
  match_key: string;
  label: string;
  description: string;
}> = [
  { match_key: "cash",       label: "Cash",        description: "Physical cash collected" },
  { match_key: "visa",       label: "Visa",        description: "Visa card receivable" },
  { match_key: "mastercard", label: "Mastercard",  description: "Mastercard receivable" },
  { match_key: "amex",       label: "Amex",        description: "American Express receivable" },
  { match_key: "union_pay",  label: "UnionPay",    description: "UnionPay receivable" },
  { match_key: "jcb",        label: "JCB",         description: "JCB receivable" },
  { match_key: "alipay",     label: "Alipay",      description: "Alipay receivable" },
  { match_key: "wechat",     label: "WeChat",      description: "WeChat Pay receivable" },
  { match_key: "payme",      label: "PayMe",       description: "PayMe receivable" },
];

export function RevenueMappingMatrix({ accounts }: { accounts: ChartAccount[] }) {
  const { items, upsert } = useAccountMapping();

  const lookup = useMemo(() => {
    const m = new Map<string, string>(); // key: rule_type|match_key -> account_id
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

  const accountsForRow = (allowed: AccountType[]) =>
    allowed.flatMap((t) => accountsByType.get(t) ?? []);

  // For payment side, allow asset accounts (cash + receivables)
  const paymentAccounts = accountsByType.get("asset") ?? [];

  const handleChange = (rule_type: string, match_key: string, account_id: string) => {
    upsert({ rule_type, match_key, account_id });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        These rules tell the system how each line on a sales receipt flows into the books.
        Pick a Chart of Accounts entry for every venue and payment method below — changes save automatically.
      </p>

      {/* SALES SIDE — venue matrix */}
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Sales side</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per venue — every row of a scanned receipt is posted to these accounts.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                <th className="px-4 py-2.5 font-medium w-[260px]">Receipt field</th>
                {VENUES.map((v) => (
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
                    {VENUES.map((venue) => {
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

      {/* PAYMENT SIDE — single column */}
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Payment side</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Where each payment method settles to. Cash hits Cash on Hand; cards become Merchant Receivables.
          </p>
        </div>
        <div className="divide-y divide-border/30">
          {PAYMENT_ROWS.map((row) => {
            const current = lookup.get(`sales_payment_method|${row.match_key}`) ?? "";
            const isMapped = !!current;
            return (
              <div key={row.match_key} className="px-4 py-2.5 grid grid-cols-[260px_1fr_auto] items-center gap-3 hover:bg-muted/20 transition-colors">
                <div>
                  <div className="text-sm font-medium">{row.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{row.description}</div>
                </div>
                <Select value={current || undefined} onValueChange={(v) => handleChange("sales_payment_method", row.match_key, v)}>
                  <SelectTrigger className="h-9 text-xs max-w-md">
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
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Posting preview */}
      <Card className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">How a sales receipt posts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Example: Caliente daily sales of <span className="font-mono">$1,000</span> subtotal,
          <span className="font-mono"> $100</span> service, <span className="font-mono">−$50</span> discount,
          <span className="font-mono"> $30</span> card tips, paid <span className="font-mono">$400</span> cash + <span className="font-mono">$680</span> Visa.
        </p>
        <div className="font-mono text-xs bg-muted/40 rounded p-3 leading-relaxed">
          <div className="grid grid-cols-[1fr_90px_90px] gap-2 text-muted-foreground border-b border-border/40 pb-1 mb-1">
            <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
          </div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Cash on Hand</span><span className="text-right">400.00</span><span></span></div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Merchant Receivable – Visa (incl. tips)</span><span className="text-right">710.00</span><span></span></div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Sales Discounts – Caliente</span><span className="text-right">50.00</span><span></span></div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Sales – Caliente</span><span></span><span className="text-right">1,000.00</span></div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Service Charge – Caliente</span><span></span><span className="text-right">100.00</span></div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Tips Payable – Caliente</span><span></span><span className="text-right">30.00</span></div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-t border-border/40 mt-1 pt-1 font-semibold">
            <span>Total</span><span className="text-right">1,160.00</span><span className="text-right">1,130.00</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Note: Tips ($30) ride on the card receivable, then are credited to Tips Payable on the balance sheet.
          </div>
        </div>
      </Card>
    </div>
  );
}
