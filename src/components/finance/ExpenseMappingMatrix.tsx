import { useEffect, useMemo, useState } from "react";
import { ChartAccount } from "@/hooks/useChartOfAccounts";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  default_account_id: string | null;
  parent_category_id: string | null;
  is_active: boolean;
}

export function ExpenseMappingMatrix({ accounts }: { accounts: ChartAccount[] }) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("expense_categories")
      .select("id,name,default_account_id,parent_category_id,is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name");
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantLoading]);

  const eligibleAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.is_active && (a.account_type === "opex" || a.account_type === "cogs"),
      ),
    [accounts],
  );

  const ordered = useMemo(() => {
    const idset = new Set(rows.map((r) => r.id));
    const parents = rows.filter((r) => !r.parent_category_id);
    const out: { row: Category; isChild: boolean }[] = [];
    for (const p of parents) {
      out.push({ row: p, isChild: false });
      rows
        .filter((c) => c.parent_category_id === p.id)
        .forEach((c) => out.push({ row: c, isChild: true }));
    }
    for (const r of rows) {
      if (r.parent_category_id && !idset.has(r.parent_category_id)) {
        out.push({ row: r, isChild: false });
      }
    }
    return out;
  }, [rows]);

  const mappedCount = rows.filter((r) => !!r.default_account_id).length;
  const total = rows.length;
  const unmapped = total - mappedCount;

  const handleChange = async (id: string, account_id: string) => {
    // Optimistic
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, default_account_id: account_id } : r)),
    );
    const { error } = await supabase
      .from("expense_categories")
      .update({ default_account_id: account_id })
      .eq("id", id)
      .eq("tenant_id", tenantId!);
    if (error) {
      toast.error(error.message);
      load();
    } else {
      toast.success("Mapping saved");
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Each active <span className="font-medium">expense category</span> points to a Chart of
        Accounts entry. Bill allocations inherit this mapping when posted.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : total === 0 ? (
        <Card className="card-glass p-6 text-center text-sm text-muted-foreground">
          No active expense categories yet. Create them in Expenses → Categories.
        </Card>
      ) : (
        <Card className="card-glass overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Expense Categories → GL Account</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Default debit account for bill allocations under each category.
              </p>
            </div>
            <div
              className={`text-xs font-medium tabular-nums px-2.5 py-1 rounded-md ${
                unmapped > 0
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {mappedCount} of {total} categories mapped
              {unmapped > 0 ? ` — ${unmapped} unmapped` : ""}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                  <th className="px-4 py-2.5 font-medium w-[320px]">Category</th>
                  <th className="px-3 py-2.5 font-medium">Default GL Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {ordered.map(({ row, isChild }) => {
                  const current = row.default_account_id ?? "";
                  const isMapped = !!current;
                  return (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      <td
                        className={`px-4 py-3 text-sm font-medium ${
                          isChild ? "pl-8 text-muted-foreground font-normal" : ""
                        }`}
                      >
                        {isChild ? (
                          <span className="text-muted-foreground/60 mr-1">└</span>
                        ) : null}
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={current || undefined}
                            onValueChange={(v) => handleChange(row.id, v)}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select account…" />
                            </SelectTrigger>
                            <SelectContent>
                              {eligibleAccounts.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  <span className="font-mono text-muted-foreground mr-2">
                                    {a.code}
                                  </span>
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
      )}

      <Card className="card-glass p-4">
        <h3 className="text-sm font-semibold mb-2">How an expense bill posts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Every bill allocation line needs both a <span className="font-medium">category</span> and
          a <span className="font-medium">GL account</span>. The account is resolved as:
        </p>
        <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
          <li>Per-line account override (set on the allocation)</li>
          <li>This mapping (the category&apos;s default GL account)</li>
        </ol>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-3">
          Unlike Procurement, there is <span className="font-semibold">no suspense fallback</span> —
          bills with any unmapped line cannot be posted at all until fixed.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          The credit always goes to <span className="font-mono">Accounts Payable – Vendor</span>.
          Payment of a bill debits AP and credits Cash/Bank.
        </p>
      </Card>
    </div>
  );
}
