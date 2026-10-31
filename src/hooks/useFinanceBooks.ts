import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type {
  BookAccount,
  BookEntry,
  BookLine,
  MonthCheck,
  TypedLine,
} from "@/utils/financeClose";
export function useFinanceBooks(year: number) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [data, setData] = useState<{
    entries: BookEntry[];
    lines: BookLine[];
    accounts: BookAccount[];
    typed: TypedLine[];
    sales: any[];
    bills: any[];
    invoices: any[];
    closed: any[];
    links: any[];
    checks: MonthCheck[];
  }>({
    entries: [],
    lines: [],
    accounts: [],
    typed: [],
    sales: [],
    bills: [],
    invoices: [],
    closed: [],
    links: [],
    checks: [],
  });
  const sequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refetch = useCallback(async () => {
    const seq = ++sequence.current;
    if (!tenantId) {
      setData({
        entries: [],
        lines: [],
        accounts: [],
        typed: [],
        sales: [],
        bills: [],
        invoices: [],
        closed: [],
        links: [],
        checks: [],
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const tables = [
        "journal_entries",
        "journal_lines",
        "chart_of_accounts",
        "pl_manual_lines",
        "sales_records",
        "expense_bills",
        "invoices",
        "finance_closed_periods",
        "finance_typed_adjustment_links",
      ];
      const rows = await Promise.all(
        tables.map((table) =>
          fetchAllRows(table, "*", { col: "id", asc: true }, tenantId, true),
        ),
      );
      const years = [
        ...new Set([
          year,
          ...rows[0].map((e) => Number(e.entry_date.slice(0, 4))),
          ...rows[3].map((l) => Number(l.year)),
        ]),
      ];
      const checks = await Promise.all(
        years.flatMap((y) =>
          Array.from({ length: 12 }, async (_, i) => {
            const { data, error } = await supabase.rpc("finance_month_checks", {
              p_tenant_id: tenantId,
              p_month: `${y}-${String(i + 1).padStart(2, "0")}-01`,
            });
            if (error) throw error;
            return data as unknown as MonthCheck;
          }),
        ),
      );
      if (seq !== sequence.current) return;
      setData({
        entries: rows[0],
        lines: rows[1],
        accounts: rows[2],
        typed: rows[3],
        sales: rows[4],
        bills: rows[5],
        invoices: rows[6],
        closed: rows[7],
        links: rows[8],
        checks,
      });
    } catch (e) {
      if (seq !== sequence.current) return;
      setError(
        e instanceof Error ? e.message : String((e as any)?.message ?? e),
      );
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [tenantId, year]);
  useEffect(() => {
    if (!tenantLoading) void refetch();
  }, [tenantLoading, refetch]);
  return { ...data, tenantId, loading, error, refetch };
}
