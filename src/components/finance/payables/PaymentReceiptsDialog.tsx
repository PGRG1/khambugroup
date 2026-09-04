import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { PAYMENT_RECEIPT_BUCKET, formatFileSize } from "@/utils/paymentReceipts";

export interface PaymentReceiptRow {
  id: string;
  bucket: string;
  path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
}

type Signed = PaymentReceiptRow & { url: string | null };

export function PaymentReceiptsDialog({
  open,
  onOpenChange,
  paymentId,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paymentId: string | null;
  title?: string;
}) {
  const [rows, setRows] = useState<Signed[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !paymentId) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("payment_receipts")
        .select("id, bucket, path, original_name, mime_type, size_bytes, sort_order")
        .eq("payment_id", paymentId)
        .order("sort_order");
      const list: PaymentReceiptRow[] = data || [];
      const signed = await Promise.all(
        list.map(async (r) => {
          const { data: s } = await supabase.storage
            .from(r.bucket || PAYMENT_RECEIPT_BUCKET)
            .createSignedUrl(r.path, 3600);
          return { ...r, url: s?.signedUrl || null };
        }),
      );
      if (!cancelled) { setRows(signed); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, paymentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {title || "Payment receipts"} · {rows.length} {rows.length === 1 ? "file" : "files"}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading receipts…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No receipts attached to this payment.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.original_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.mime_type} · {formatFileSize(Number(r.size_bytes) || 0)}
                  </div>
                </div>
                {r.url ? (
                  <>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                      <a href={r.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" />View</a>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                      <a href={r.url} download={r.original_name}><Download className="h-3.5 w-3.5 mr-1" />Download</a>
                    </Button>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400 text-[11px]">
                    <AlertTriangle className="h-3.5 w-3.5" /> File missing from storage
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
