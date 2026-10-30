import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/utils/format";

export function ReceiptIntakes({ revision, venueIds }: { revision: number; venueIds: string[] }) {
  const { tenantId } = useActiveTenant();
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["receipt-intakes", tenantId, revision], enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from("sales_receipt_intakes").select("*").eq("tenant_id", tenantId).eq("status", "needs_review").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    } });
  const rows = (q.data ?? []).filter(r => r.venue_id === null || venueIds.includes(r.venue_id));
  const current = rows.find(r => r.id === selected);
  const comparisons = useQuery({ queryKey: ["receipt-comparison", tenantId, current?.id], enabled: !!current,
    queryFn: async () => {
      if (!current || !tenantId || !current.existing_record_ids.length) return [];
      const { data, error } = await supabase.from("sales_records").select("id,date,venue,report_number,total_sales").eq("tenant_id", tenantId).in("id", current.existing_record_ids);
      if (error) throw error;
      return data ?? [];
    } });
  const openSource = async () => {
    if (!current) return;
    const { data, error } = await supabase.storage.from("sales-receipt-intake").createSignedUrl(current.source_path, 60);
    if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else setSourceError("Source could not be opened. Try again.");
  };
  const [sourceError, setSourceError] = useState("");
  if (q.isError) return <p className="text-sm text-warning">Flagged receipts could not be loaded.</p>;
  if (!rows.length) return null;
  return <section className="mb-4 space-y-2">
    <h3 className="text-sm font-semibold text-warning">Receipts needing review · no sales posted</h3>
    {rows.map(r => <div key={r.id} className="flex min-w-0 items-center justify-between gap-2 border-b border-border py-2 text-sm">
      <span className="min-w-0 break-all">{r.source_name}</span>
      <Button variant="outline" size="sm" onClick={() => { setSelected(r.id); setSourceError(""); }}>Review</Button>
    </div>)}
    {rows.length >= 100 && <p className="text-xs text-muted-foreground">Latest 100 receipts shown.</p>}
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Receipt needs review</DialogTitle></DialogHeader>
        {current && <>
          <p className="break-all text-sm">{current.source_name}</p>
          <Button variant="outline" onClick={openSource}>View original receipt</Button>
          {sourceError && <p className="text-sm text-warning">{sourceError}</p>}
          <ul className="list-disc pl-4 text-sm text-warning">{(Array.isArray(current.reasons) ? current.reasons : []).map((reason, i) => <li key={i}>{String(reason)}</li>)}</ul>
          <h4 className="text-sm font-semibold">Tentative figures · not posted</h4>
          <dl className="grid grid-cols-2 gap-2 text-sm">{Object.entries((current.tentative_values ?? {}) as Record<string, unknown>).filter(([k]) => !["receiptFileUrl", "receiptFileName"].includes(k)).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-muted-foreground">{key}</dt><dd className="break-all">{String(value ?? "Unknown")}</dd></div>)}</dl>
          <h4 className="text-sm font-semibold">Existing records</h4>
          {comparisons.isError ? <p className="text-sm text-warning">Comparison lookup failed.</p> : comparisons.isPending ? <p className="text-sm">Loading comparison…</p> : comparisons.data?.length ? comparisons.data.map(r => <p key={r.id} className="text-sm">{r.venue} · {formatDate(r.date)} · {r.report_number || "No report number"} · {formatCurrency(Number(r.total_sales))}</p>) : <p className="text-sm text-muted-foreground">No matching date or report found. Distinct sessions still need checking.</p>}
          <p className="text-sm text-muted-foreground">Compare the original receipt with these figures and existing sales. Resolution and source-verified posting are not available yet; this receipt remains flagged.</p>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}