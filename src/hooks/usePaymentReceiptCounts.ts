import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Receipt count per payment id, for compact icon/count indicators. */
export function usePaymentReceiptCounts(paymentIds: string[]) {
  const key = paymentIds.slice().sort().join(",");
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) { setCounts(new Map()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("payment_receipts")
        .select("payment_id")
        .in("payment_id", ids);
      if (cancelled) return;
      const m = new Map<string, number>();
      (data || []).forEach((r: any) => m.set(r.payment_id, (m.get(r.payment_id) || 0) + 1));
      setCounts(m);
    })();
    return () => { cancelled = true; };
  }, [key]);

  return counts;
}
