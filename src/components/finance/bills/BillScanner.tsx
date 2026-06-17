import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, Camera, Loader2, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ScannedBill {
  vendor_name: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  service_period_start: string;
  service_period_end: string;
  venue: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string;
  suggested_document_type: string;
  allocations: { expense_category: string; amount: number; notes: string }[];
  attachment_url?: string;
  attachment_path?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (data: ScannedBill) => void;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BillScanner({ open, onOpenChange, onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFiles([]);
    setPreviews([]);
    setScanning(false);
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const arr = Array.from(selected);
    for (const f of arr) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is too large (max 15 MB)`);
        return;
      }
    }
    setFiles((prev) => [...prev, ...arr]);
    arr.forEach((f) => {
      if (f.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = () => setPreviews((p) => [...p, r.result as string]);
        r.readAsDataURL(f);
      } else {
        setPreviews((p) => [...p, ""]); // placeholder for non-images
      }
    });
  };

  const removeFile = (idx: number) => {
    setFiles((f) => f.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const handleScan = async () => {
    if (files.length === 0) return;
    setScanning(true);
    try {
      // Build payload
      const payload = await Promise.all(
        files.map(async (f) => ({
          base64: await fileToBase64(f),
          mimeType: f.type || "application/octet-stream",
        }))
      );

      // Upload first file to storage so we can keep the original attachment
      const auth = (await supabase.auth.getUser()).data.user?.id;
      let attachment_url: string | undefined;
      let attachment_path: string | undefined;
      try {
        const first = files[0];
        const ext = first.name.split(".").pop() || "bin";
        const path = `${auth || "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from("bill-attachments").upload(path, first, {
          contentType: first.type,
          upsert: false,
        });
        if (!up.error) {
          attachment_path = up.data.path;
          const signed = await supabase.storage.from("bill-attachments").createSignedUrl(up.data.path, 60 * 60 * 24 * 7);
          attachment_url = signed.data?.signedUrl;
        }
      } catch (e) {
        console.warn("Attachment upload failed (non-fatal):", e);
      }

      const { data, error } = await supabase.functions.invoke("parse-bill", {
        body: { files: payload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Scan failed");

      const parsed = data.data as ScannedBill;
      if (parsed.suggested_document_type === "procurement_invoice") {
        toast.warning("This looks like a stock/inventory invoice — consider using the Procurement scanner instead.");
      }
      parsed.attachment_url = attachment_url;
      parsed.attachment_path = attachment_path;

      toast.success("Bill scanned. Review the details before saving.");
      onParsed(parsed);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Scan failed: " + (e?.message || e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan Bill / Expense Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload or photograph a non-inventory bill (utility, rent, telecom, service, licence, etc.).
            The AI will extract vendor, dates, totals, and suggest expense allocations.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={scanning}>
              <Upload className="h-4 w-4 mr-2" /> Choose files
            </Button>
            <Button variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning}>
              <Camera className="h-4 w-4 mr-2" /> Camera
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-auto">
              {files.map((f, idx) => (
                <div key={idx} className="relative border rounded p-2 bg-muted/30">
                  <button
                    className="absolute top-1 right-1 bg-background border rounded-full p-0.5"
                    onClick={() => removeFile(idx)}
                    disabled={scanning}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {previews[idx] ? (
                    <img src={previews[idx]} alt={f.name} className="w-full h-24 object-cover rounded" />
                  ) : (
                    <div className="h-24 flex items-center justify-center text-muted-foreground">
                      <FileText className="h-8 w-8" />
                    </div>
                  )}
                  <div className="text-xs mt-1 truncate" title={f.name}>{f.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={scanning}>Cancel</Button>
          <Button onClick={handleScan} disabled={scanning || files.length === 0}>
            {scanning ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning…</>) : "Scan & Extract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
