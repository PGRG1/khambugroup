import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { SalesLine } from "@/types/sales";
import { linesForVenue, type SetupKind } from "../../supabase/functions/_shared/setupReceipt";

export interface SetupRow { id: string; venue_id: string | null; printed_name: string; kind: SetupKind; category: string | null; legacy_field: string | null; sort_order: number }

/**
 * Clients set up line by line (a sales report setup with no fixed fields): their setup and the lines of
 * the given sales records. For KHAMBU-style clients `lineMode` is false and nothing else is loaded.
 */
export function useSalesLines(recordIds: string[]) {
  const { tenantId } = useActiveTenant();
  const setupQ = useQuery({ queryKey: ["sales-setup-lines", tenantId], enabled: !!tenantId, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_report_lines").select("id,venue_id,printed_name,kind,category,legacy_field,sort_order")
        .eq("tenant_id", tenantId!).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as SetupRow[];
    } });
  const setup = setupQ.data ?? [];
  const lineMode = setup.length > 0 && setup.every((r) => !r.legacy_field);
  const ids = useMemo(() => [...new Set(recordIds)].sort(), [recordIds]);
  const linesQ = useQuery({ queryKey: ["sales-record-lines", tenantId, ids.join(",")], enabled: !!tenantId && lineMode && ids.length > 0,
    queryFn: async () => {
      const rows: { sales_record_id: string; line_id: string | null; printed_name: string; amount: number }[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase.from("sales_record_lines").select("sales_record_id,line_id,printed_name,amount").eq("tenant_id", tenantId!).in("sales_record_id", ids.slice(i, i + 150));
        if (error) throw error;
        rows.push(...((data ?? []) as typeof rows));
      }
      return rows;
    } });
  const byRecord = useMemo(() => {
    const kindOf = new Map(setup.map((s) => [s.id, s]));
    const order = new Map(setup.map((s, i) => [s.printed_name.toLowerCase(), i]));
    const out = new Map<string, SalesLine[]>();
    for (const l of linesQ.data ?? []) {
      const s = l.line_id ? kindOf.get(l.line_id) : setup.find((x) => x.printed_name.toLowerCase() === l.printed_name.toLowerCase());
      const list = out.get(l.sales_record_id) ?? [];
      list.push({ printed: l.printed_name, amount: Number(l.amount), kind: s?.kind ?? null, known: !!s });
      out.set(l.sales_record_id, list);
    }
    for (const list of out.values()) list.sort((a, b) => (order.get(a.printed.toLowerCase()) ?? 999) - (order.get(b.printed.toLowerCase()) ?? 999));
    return out;
  }, [linesQ.data, setup]);
  /** The setup lines a venue's reports use (its own setup when it has one, otherwise all venues). */
  const forVenue = (venueId: string | null) => linesForVenue(setup, venueId);
  /** Every printed line across venues, in setup order, once each (download columns). */
  const columns = useMemo(() => [...new Map(setup.map((s) => [s.printed_name.toLowerCase(), s.printed_name])).values()], [setup]);
  return { lineMode, setup, forVenue, columns, byRecord, loading: setupQ.isPending || (lineMode && ids.length > 0 && linesQ.isPending) };
}
