import { useEffect, useMemo, useState } from "react";
import { ChartAccount, AccountType } from "@/hooks/useChartOfAccounts";
import { useAccountMapping } from "@/hooks/useAccountMapping";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, AlertCircle } from "lucide-react";

const TREATMENTS: Array<{ value: string; label: string; allowed: AccountType[] }> = [
  { value: "COGS",                     label: "COGS",                     allowed: ["cogs"] },
  { value: "OpEx",                     label: "OpEx",                     allowed: ["opex"] },
  { value: "Asset - Supplier Deposit", label: "Asset – Supplier Deposit", allowed: ["asset"] },
  { value: "Asset - Fixed Asset",      label: "Asset – Fixed Asset",      allowed: ["asset"] },
  { value: "Asset - Prepayment",       label: "Asset – Prepayment",       allowed: ["asset"] },
  { value: "Asset - Other",            label: "Asset – Other",            allowed: ["asset"] },
];

interface CatRow {
  treatment: string;
  l1: string;
  product_count: number;
  override_count: number;
}

export function ProcurementMappingMatrix({ accounts }: { accounts: ChartAccount[] }) {
  const { items, upsert } = useAccountMapping();
  const [rows, setRows] = useState<CatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("product_master" as any)
        .select("financial_treatment, level1_category, default_coa_account_id");
      if (error) { setLoading(false); return; }
      const map = new Map<string, CatRow>();
      (data as any[] ?? []).forEach((p) => {
        const t = p.financial_treatment || "";
        const l1 = p.level1_category || "";
        if (!t || !l1) return;
        const key = `${t}__${l1}`;
        const existing = map.get(key) ?? { treatment: t, l1, product_count: 0, override_count: 0 };
        existing.product_count += 1;
        if (p.default_coa_account_id) existing.override_count += 1;
        map.set(key, existing);
      });
      setRows(Array.from(map.values()).sort((a, b) =>
        a.treatment.localeCompare(b.treatment) || a.l1.localeCompare(b.l1)
      ));
      setLoading(false);
    };
    load();
  }, []);

  const lookup = useMemo(() => {
    const m = new Map<string, string>();
    items.filter((r) => r.rule_type === "procurement_category")
      .forEach((r) => m.set(r.match_key, r.account_id));
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

  const accountsFor = (treatment: string) => {
    const t = TREATMENTS.find((x) => x.value === treatment);
    if (!t) return accounts.filter((a) => a.is_active);
    return t.allowed.flatMap((tt) => accountsByType.get(tt) ?? []);
  };

  // Group rows by treatment for visual grouping
  const grouped = useMemo(() => {
    const m = new Map<string, CatRow[]>();
    rows.forEach((r) => {
      if (!m.has(r.treatment)) m.set(r.treatment, []);
      m.get(r.treatment)!.push(r);
    });
    return m;
  }, [rows]);

  const handleChange = (treatment: string, l1: string, account_id: string) => {
    upsert({ rule_type: "procurement_category", match_key: `${treatment}__${l1}`, account_id });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Each combination of <span className="font-medium">Financial Treatment</span> +{" "}
        <span className="font-medium">L1 Category</span> below points to a Chart of Accounts entry.
        Invoice line items inherit this mapping unless a product has its own override.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : rows.length === 0 ? (
        <Card className="card-glass p-6 text-center text-sm text-muted-foreground">
          No products have a Financial Treatment + L1 Category yet. Set them in Procurement → Product Master.
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([treatment, list]) => {
          const tLabel = TREATMENTS.find((t) => t.value === treatment)?.label ?? treatment;
          const eligible = accountsFor(treatment);
          return (
            <Card key={treatment} className="card-glass overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40 bg-muted/30">
                <h3 className="text-sm font-semibold">{tLabel}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {list.length} {list.length === 1 ? "category" : "categories"} — debit account for invoices in this treatment.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                      <th className="px-4 py-2.5 font-medium w-[280px]">L1 Category</th>
                      <th className="px-3 py-2.5 font-medium w-[100px] text-right">Products</th>
                      <th className="px-3 py-2.5 font-medium w-[110px] text-right">Overrides</th>
                      <th className="px-3 py-2.5 font-medium">Default COA Account</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {list.map((row) => {
                      const key = `${row.treatment}__${row.l1}`;
                      const current = lookup.get(key) ?? "";
                      const isMapped = !!current;
                      return (
                        <tr key={key} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium">{row.l1}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                            {row.product_count}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                            {row.override_count > 0 ? (
                              <span className="text-amber-700">{row.override_count}</span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Select value={current || undefined} onValueChange={(v) => handleChange(row.treatment, row.l1, v)}>
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      <Card className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">How an invoice posts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Each invoice line resolves its debit account in this order:
        </p>
        <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
          <li>Per-product override (set on the product in Product Master)</li>
          <li>This mapping (Treatment + L1 Category)</li>
          <li>Otherwise the line is unmapped and the invoice will not post until corrected</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-3">
          The credit always goes to <span className="font-mono">Accounts Payable – Vendor</span>. Payment of an invoice debits AP and credits Cash/Bank.
        </p>
      </Card>
    </div>
  );
}
