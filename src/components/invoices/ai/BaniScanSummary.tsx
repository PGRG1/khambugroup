import { useState, useEffect } from "react";
import { Sparkles, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { runBaniScan } from "@/lib/baniRunScan";
import { toast } from "sonner";

interface Props {
  invoiceId: string;
}

/**
 * Bani — scan analysis card. Reads cached ai_suggestions + ai_anomaly from
 * the invoice row. Never calls AI on mount; "Re-run" is the only manual trigger.
 */
export function BaniScanSummary({ invoiceId }: Props) {
  const { tenantId } = useActiveTenant();
  const [data, setData] = useState<{ ai_suggestions: any; ai_anomaly: any; ai_extract_meta: any } | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data: row } = await (supabase as any)
      .from("invoices")
      .select("ai_suggestions, ai_anomaly, ai_extract_meta")
      .eq("id", invoiceId)
      .maybeSingle();
    setData(row ?? null);
  };

  useEffect(() => { load(); }, [invoiceId]);

  const rerun = async () => {
    if (!tenantId) { toast.error("No tenant selected"); return; }
    setRunning(true);
    const r = await runBaniScan({ invoiceId, tenantId, force: true });
    setRunning(false);
    if (!r.ok) toast.error(`Bani scan failed: ${r.error}`);
    else { toast.success("Bani re-ran the scan"); await load(); }
  };

  const supplier = data?.ai_suggestions?.supplier ?? null;
  const anomaly = data?.ai_anomaly ?? null;
  const flags: any[] = anomaly?.flags ?? [];
  const model = anomaly?.model_used ?? data?.ai_extract_meta?.model_used ?? "—";
  const proUsed = data?.ai_extract_meta?.pro_used === true;

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-emerald-300">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">Bani — Scan analysis</span>
          <span className="text-xs text-muted-foreground">
            {model}{proUsed ? " · Pro fallback" : ""}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={rerun} disabled={running} className="h-7 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          Re-run
        </Button>
      </div>

      {!data?.ai_suggestions && !running && (
        <div className="text-xs text-muted-foreground">
          Bani hasn't analyzed this invoice yet. Click <span className="text-foreground">Re-run</span> to extract, match and check it.
        </div>
      )}

      {supplier && (
        <div className="flex items-center gap-2 text-xs mb-1">
          <span className="text-muted-foreground w-20">Supplier</span>
          <span className="text-foreground">{supplier.supplier_name ?? "—"}</span>
          {typeof supplier.confidence === "number" && (
            <span className="text-emerald-300/80">{Math.round(supplier.confidence * 100)}%</span>
          )}
        </div>
      )}

      {flags.length === 0 && data?.ai_suggestions && (
        <div className="flex items-center gap-2 mt-2 text-xs text-emerald-300/80">
          <CheckCircle2 className="h-3.5 w-3.5" /> No anomalies detected
        </div>
      )}

      {flags.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-amber-300 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {flags.length} issue{flags.length === 1 ? "" : "s"} need attention
          </div>
          {flags.map((f, i) => (
            <div key={i} className="ml-5 text-xs text-muted-foreground">
              • <span className="text-foreground">{f.type}</span>
              {f.reason ? ` — ${f.reason}` : ""}
              {typeof f.confidence === "number" ? ` (${Math.round(f.confidence * 100)}%)` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
