import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageBani } from "@/components/kit/PageBani";
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
  const findings = rows.map(r => ({ id: `intake-${r.id}`, tone: "amber" as const, title: `Receipt needs review · no sales posted: ${r.source_name}`, detail: "", label: "Review", group: "intake", groupTitle: (n: number) => `${n} receipts need review · no sales posted`, onOpen: () => { setSelected(r.id); setSourceError(""); } }));
  const first = findings[0];
  if (findings.length > 1) first.onOpen = () => { setSelected(rows[0].id); setSourceError(""); };
  return <>
    <PageBani findings={findings.length > 1 ? [{ ...first, title: `${rows.length}${rows.length >= 100 ? "+" : ""} receipts need review · no sales posted · open the latest`, group: undefined }, ...findings.slice(1).map(f => ({ ...f, title: f.title.replace("Receipt needs review · no sales posted: ", ""), group: undefined }))] : findings} />
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Receipt needs review</DialogTitle></DialogHeader>
        {current && <>
          <p className="break-all text-sm">{current.source_name}</p>
          <Button variant="outline" onClick={openSource}>View original receipt</Button>
          {sourceError && <p className="text-sm text-warning">{sourceError}</p>}
          <ul className="list-disc pl-4 text-sm text-warning">{(Array.isArray(current.reasons) ? current.reasons : []).map((reason, i) => <li key={i}>{String(reason)}</li>)}</ul>
          <h4 className="text-sm font-semibold">Original extraction / tentative figures · unverified, not posted</h4>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">{Object.entries((current.tentative_values ?? {}) as Record<string, unknown>).filter(([k]) => !["receiptFileUrl", "receiptFileName", "id"].includes(k)).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-muted-foreground capitalize">{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd className="break-words td-num">{receiptValue(key, (current.original_values as Record<string, unknown>)?.[key])} / {receiptValue(key, value)}</dd></div>)}</dl>
          <h4 className="text-sm font-semibold">Existing records</h4>
          {comparisons.isError ? <p className="text-sm text-warning">Comparison lookup failed.</p> : comparisons.isPending ? <p className="text-sm">Loading comparison…</p> : comparisons.data?.length ? comparisons.data.map(r => <p key={r.id} className="text-sm">{r.venue} · {formatDate(r.date)} · {r.report_number || "No report number"} · {formatCurrency(Number(r.total_sales))}</p>) : <p className="text-sm text-muted-foreground">No matching date or report found. Distinct sessions still need checking.</p>}
          <p className="text-sm text-muted-foreground">Compare the original receipt with these figures and existing sales. Resolution and source-verified posting are not available yet; this receipt remains flagged.</p>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}