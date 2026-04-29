import { useMemo } from "react";
import { ChartAccount } from "@/hooks/useChartOfAccounts";
import { useAccountMapping } from "@/hooks/useAccountMapping";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, AlertCircle } from "lucide-react";

const VENUES = ["", "Assembly", "Caliente", "Hanabi", "Events"] as const;
const PAYMENT_METHODS = ["bank_transfer", "cash", "cheque"] as const;

const EXPENSE_ROWS: Array<{
  rule_type: string;
  label: string;
  description: string;
}> = [
  { rule_type: "payroll_salary_expense", label: "Salaries Expense", description: "Gross salary cost (P&L OpEx)" },
  { rule_type: "payroll_mpf_expense", label: "MPF Expense", description: "Employer MPF contribution (P&L OpEx)" },
];

const PAYABLE_ROWS: Array<{
  rule_type: string;
  label: string;
  description: string;
}> = [
  { rule_type: "salary_payable", label: "Salary Payable", description: "Net salary owed to staff (Balance Sheet)" },
  { rule_type: "mpf_payable",    label: "MPF Payable",    description: "Total MPF (employee + employer) owed to MPF trustee" },
];

export function PayrollMappingMatrix({ accounts }: { accounts: ChartAccount[] }) {
  const { items, upsert } = useAccountMapping();

  const lookup = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((r) => m.set(`${r.rule_type}|${r.match_key}`, r.account_id));
    return m;
  }, [items]);

  const accountsByType = useMemo(() => {
    const m = new Map<string, ChartAccount[]>();
    accounts.filter((a) => a.is_active).forEach((a) => {
      if (!m.has(a.account_type)) m.set(a.account_type, []);
      m.get(a.account_type)!.push(a);
    });
    return m;
  }, [accounts]);

  const expenseAccounts = [
    ...(accountsByType.get("opex") ?? []),
    ...(accountsByType.get("cogs") ?? []),
    ...(accountsByType.get("other_expense") ?? []),
  ];
  const liabilityAccounts = accountsByType.get("liability") ?? [];
  const cashAccounts = (accountsByType.get("asset") ?? []).filter((a) => a.is_cash);

  const handle = (rule_type: string, match_key: string, account_id: string) =>
    upsert({ rule_type, match_key, account_id });

  const renderSelect = (
    rule_type: string,
    match_key: string,
    options: ChartAccount[],
    placeholder = "Select account…"
  ) => {
    const current = lookup.get(`${rule_type}|${match_key}`) ?? "";
    const isMapped = !!current;
    return (
      <div className="flex items-center gap-1.5">
        <Select value={current || undefined} onValueChange={(v) => handle(rule_type, match_key, v)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((a) => (
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
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        These rules tell the ledger how each payroll record posts to the accounts.
        The "Global" column is the default; per-venue columns let you split Salaries
        Expense by venue (P&L). Payables and cash mappings are global.
      </p>

      {/* EXPENSES per venue */}
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Expense side (P&L)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per venue — gross salary and employer MPF expense accounts. Use Global if you don't split by venue.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                <th className="px-4 py-2.5 font-medium w-[260px]">Payroll component</th>
                {VENUES.map((v) => (
                  <th key={v || "global"} className="px-3 py-2.5 font-medium">{v || "Global default"}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {EXPENSE_ROWS.map((row) => (
                <tr key={row.rule_type} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{row.description}</div>
                  </td>
                  {VENUES.map((venue) => (
                    <td key={venue || "global"} className="px-3 py-2.5">
                      {renderSelect(row.rule_type, venue, expenseAccounts)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* PAYABLES global */}
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Liabilities (Balance Sheet)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Where unpaid salaries and MPF accumulate until cleared by payment.
          </p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {PAYABLE_ROWS.map((row) => (
            <div key={row.rule_type} className="grid grid-cols-[1fr_320px] gap-4 items-center">
              <div>
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-[11px] text-muted-foreground">{row.description}</div>
              </div>
              {renderSelect(row.rule_type, "", liabilityAccounts)}
            </div>
          ))}
        </div>
      </Card>

      {/* CASH per payment method */}
      <Card className="card-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
          <h3 className="text-sm font-semibold">Cash side (per payment method)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            When net salary or MPF is paid, the credit hits this cash/bank account.
            Shared with supplier invoice payments.
          </p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {PAYMENT_METHODS.map((method) => (
            <div key={method} className="grid grid-cols-[1fr_320px] gap-4 items-center">
              <div>
                <div className="text-sm font-medium capitalize">{method.replace("_", " ")}</div>
                <div className="text-[11px] text-muted-foreground">payment_method_cash · {method}</div>
              </div>
              {renderSelect("payment_method_cash", method, cashAccounts, "Select cash account…")}
            </div>
          ))}
        </div>
      </Card>

      {/* Posting preview */}
      <Card className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">How a payroll row posts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Example: gross <span className="font-mono">$30,000</span>, MPF employee <span className="font-mono">$1,500</span>,
          MPF employer <span className="font-mono">$1,500</span>, net <span className="font-mono">$28,500</span>.
        </p>
        <div className="font-mono text-xs bg-muted/40 rounded p-3 leading-relaxed space-y-3">
          <div>
            <div className="text-muted-foreground mb-1">Entry A — Accrual (last day of month):</div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Salaries Expense (6010)</span><span className="text-right">30,000</span><span /></div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>MPF Expense (6020)</span><span className="text-right">1,500</span><span /></div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Salary Payable (2040)</span><span /><span className="text-right">28,500</span></div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>MPF Payable (2030)</span><span /><span className="text-right">3,000</span></div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Entry B — Net pay (when net_salary_payment_date is set):</div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Salary Payable (2040)</span><span className="text-right">28,500</span><span /></div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Cash / Bank</span><span /><span className="text-right">28,500</span></div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Entry C — MPF remittance (when mpf_payment_date is set):</div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>MPF Payable (2030)</span><span className="text-right">3,000</span><span /></div>
            <div className="grid grid-cols-[1fr_90px_90px] gap-2"><span>Cash / Bank</span><span /><span className="text-right">3,000</span></div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Tip: After editing payroll, go to <strong>Finance → Journal</strong> and click <strong>Rebuild from operations</strong> to refresh the ledger.
        </div>
      </Card>
    </div>
  );
}
