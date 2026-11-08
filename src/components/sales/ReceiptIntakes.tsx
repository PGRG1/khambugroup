import {ExpenseDocumentPreview} from "@/components/expenses/ExpenseDocumentPreview";
import {useBaniTopic,useBaniWorkPublisher} from "@/components/assistant/FloatingBaniContext";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate, formatTableInteger } from "@/utils/format";

const counts = ["orders", "guests"];
const texts = ["date", "day", "venue", "reportNumber", "servicePeriodId"];
function receiptValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (key === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (texts.includes(key)) return String(value);
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Unknown";
  return counts.includes(key) ? formatTableInteger(amount) : formatCurrency(amount);
}

export function useReceiptIntakes(venueIds: string[] | null, revision = 0) {
  const { tenantId } = useActiveTenant();
  const q = useQuery({ queryKey: ["receipt-intakes", tenantId, revision], enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from("sales_receipt_intakes").select("*").eq("tenant_id", tenantId).eq("status", "needs_review").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    } });
  const rows = (q.data ?? []).filter(r => r.venue_id === null || !venueIds || venueIds.includes(r.venue_id));
  return { q, rows };
}

export function ReceiptIntakes({ revision = 0, venueIds, home }: { revision?: number; venueIds: string[] | null; home?: boolean }) {
  const { tenantId } = useActiveTenant();
  const topic=useBaniTopic();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { q, rows } = useReceiptIntakes(venueIds, revision);
  useBaniWorkPublisher('/sales-data',rows.filter(r=>(r.verification as Record<string,unknown>|null)?.evidence_only).map(r=>({id:r.id,tone:'amber' as const,title:`Receipt date needs your answer: ${r.source_name}`,detail:String(r.reasons),label:'Review',question:`Review receipt evidence ${r.id}: ${r.source_name}`})),!q.isLoading);
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
    const { data, error } = await supabase.storage.from((current.verification as Record<string,unknown>|null)?.source_bucket==='sales-receipts'?'sales-receipts':"sales-receipt-intake").createSignedUrl(current.source_path, 60);
    if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else setSourceError("Source could not be opened. Try again.");
  };
  const [sourceError, setSourceError] = useState("");
  const resolve = async (reason: string) => {
    if (!current) return;
    setBusy(true); setSourceError("");
    const { error } = await (supabase as any).rpc("resolve_sales_receipt_intake", { _id: current.id, _reason: reason });
    setBusy(false);
    if (error) { setSourceError("Could not clear this receipt. Try again."); return; }
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["receipt-intakes"] });
  };
  if (q.isError) return home ? null : <p className="text-sm text-warning">Flagged receipts could not be loaded.</p>;
  if (!rows.length) return null;
  return <>
    {home && rows.slice(0, 2).map(r => <button key={r.id} className="wi" onClick={() => { setSelected(r.id); setSourceError(""); }}><i className="amb" />Check sales receipt {r.source_name}</button>)}
    {home && rows.length > 2 && <div className="more">+ {rows.length - 2} more receipts</div>}
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Receipt needs review</DialogTitle></DialogHeader>
        {current && <>
          <p className="break-all text-sm">{current.source_name}</p>
          <ExpenseDocumentPreview path={current.source_path} bucket={(current.verification as Record<string,unknown>|null)?.source_bucket==='sales-receipts'?'sales-receipts':'sales-receipt-intake'} label="Receipt photo"/><Button variant="link" onClick={()=>topic(`Which sales record does receipt evidence ${current.id} (${current.source_name}) belong to?`)}>Ask Bani</Button>
          {sourceError && <p className="text-sm text-warning">{sourceError}</p>}
          <ul className="list-disc pl-4 text-sm text-warning">{(Array.isArray(current.reasons) ? current.reasons : []).map((reason, i) => <li key={i}>{String(reason)}</li>)}</ul>
          <h4 className="text-sm font-semibold">Original extraction / tentative figures · unverified, not posted</h4>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">{Object.entries((current.tentative_values ?? {}) as Record<string, unknown>).filter(([k]) => !["receiptFileUrl", "receiptFileName", "id"].includes(k)).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-muted-foreground capitalize">{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd className="break-words td-num">{receiptValue(key, (current.original_values as Record<string, unknown>)?.[key])} / {receiptValue(key, value)}</dd></div>)}</dl>
          <h4 className="text-sm font-semibold">Existing records</h4>
          {comparisons.isError ? <p className="text-sm text-warning">Comparison lookup failed.</p> : comparisons.isPending ? <p className="text-sm">Loading comparison…</p> : comparisons.data?.length ? comparisons.data.map(r => <p key={r.id} className="text-sm">{r.venue} · {formatDate(r.date)} · {r.report_number || "No report number"} · {formatCurrency(Number(r.total_sales))}</p>) : <p className="text-sm text-muted-foreground">No matching date or report found. Distinct sessions still need checking.</p>}
          <p className="text-sm text-muted-foreground">Nothing has been posted from this receipt. If the sales are already recorded or the scan isn't needed, clear it. To record these sales, use Scan Receipt on Sales Data again.</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => resolve("already_recorded")}>Already recorded – clear</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => resolve("not_needed")}>Not needed – discard</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}