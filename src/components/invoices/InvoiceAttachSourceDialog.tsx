import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, AlertTriangle } from "lucide-react";
import { uploadInvoiceSources, attachmentsToColumns, INVOICE_BUCKET } from "@/utils/invoiceAttachments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: { id: string; invoice_number: string; invoice_date: string; tenant_id?: string | null } | null;
  onAttached: () => void;
}

/**
 * Repair flow: attaches a source document to an existing invoice without
 * touching its id, line items, financial posting or status.
 */
export default function InvoiceAttachSourceDialog({ open, onOpenChange, invoice, onAttached }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const close = () => { setFiles([]); setBusy(false); onOpenChange(false); };

  const handleAttach = async () => {
    if (!invoice || files.length === 0) return;
    setBusy(true);
    try {
      const stored = await uploadInvoiceSources(
        {
          upload: (path, file, opts) =>
            supabase.storage.from(INVOICE_BUCKET).upload(path, file, { upsert: opts.upsert, contentType: opts.contentType })
              .then((r) => ({ error: r.error ? { message: r.error.message } : null })),
          exists: async (path) => {
            const slash = path.lastIndexOf("/");
            const dir = slash > 0 ? path.slice(0, slash) : "";
            const base = slash > 0 ? path.slice(slash + 1) : path;
            const { data } = await supabase.storage.from(INVOICE_BUCKET).list(dir, { search: base, limit: 100 });
            return !!data?.some((o) => o.name === base);
          },
        },
        invoice.invoice_date,
        `${invoice.invoice_number}_repair`,
        files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f })),
      );

      const cols = attachmentsToColumns(stored);
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("invoices")
        .update({ file_url: cols.file_url, file_name: cols.file_name } as any)
        .eq("id", invoice.id);
      if (error) throw new Error(error.message);

      try {
        await supabase.from("audit_log").insert({
          user_id: userRes.user?.id,
          user_display_name: userRes.user?.email || "Unknown",
          action: "attach_receipt",
          entity_type: "invoice",
          entity_id: invoice.id,
          details: { repaired_attachment: cols.file_url, invoice_number: invoice.invoice_number },
        } as any);
      } catch (e) {
        console.warn("[invoice-attachment] audit log failed", e);
      }

      toast.success("Source document attached.");
      onAttached();
      close();
    } catch (e: any) {
      console.error("[invoice-attachment] repair failed", e);
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
            invoice data, line items and status stay exactly as they are.
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
