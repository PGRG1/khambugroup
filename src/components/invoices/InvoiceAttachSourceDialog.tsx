import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, AlertTriangle } from "lucide-react";
import { uploadInvoiceSources, newlyCreatedPaths } from "@/utils/invoiceAttachments";
import { supabaseStorageAdapter, linkInvoiceAttachments } from "@/utils/invoiceAttachmentClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: { id: string; invoice_number: string; invoice_date: string } | null;
  tenantId: string | null | undefined;
  onAttached: () => void;
}

/**
 * Repair flow: attaches a source document to an existing invoice without
 * touching its id, line items, financial posting or status. Storage upload is
 * verified first, then linkage + audit happen in one tenant-scoped transaction.
 */
export default function InvoiceAttachSourceDialog({ open, onOpenChange, invoice, tenantId, onAttached }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const close = () => { setFiles([]); setBusy(false); onOpenChange(false); };

  const handleAttach = async () => {
    if (!invoice || files.length === 0) return;
    if (!tenantId) { toast.error("No active client selected — cannot attach a source document."); return; }
    setBusy(true);
    const storage = supabaseStorageAdapter();
    let stored: Awaited<ReturnType<typeof uploadInvoiceSources>> | null = null;
    try {
      stored = await uploadInvoiceSources(
        storage,
        tenantId,
        invoice.invoice_date,
        invoice.invoice_number,
        files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f })),
      );
      await linkInvoiceAttachments(tenantId, invoice.id, stored, "repair");
      toast.success("Source document attached.");
      onAttached();
      close();
    } catch (e: any) {
      console.error("[invoice-attachment] repair failed", { invoice_id: invoice.id, error: e?.message });
      if (stored) {
        const created = newlyCreatedPaths(stored);
        if (created.length > 0) await storage.remove(created).catch(() => undefined);
      }
      toast.error(`Attach failed — nothing was changed. ${e?.message || ""}`);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Attach source document
          </DialogTitle>
          <DialogDescription>
            Invoice {invoice?.invoice_number} has no stored source file. Upload the original document —
            invoice data, line items, posting and status stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/30">
            <Upload className="h-4 w-4" />
            Choose file(s)
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> {f.name}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={handleAttach} disabled={busy || files.length === 0}>
            {busy ? "Attaching…" : "Attach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
