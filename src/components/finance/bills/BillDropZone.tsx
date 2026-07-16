import { useCallback, useRef, useState } from "react";
import { Upload, X, ScanLine, Loader2, Camera, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ScannedBill } from "./BillScanner";

export type { ScannedBill } from "./BillScanner";

const MAX_BYTES = 15 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve((result.split(",")[1]) || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  onParsed: (data: ScannedBill) => void;
}

export default function BillDropZone({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);

  const reset = () => {
    setFiles([]);
    setPreviews([]);
  };

  const addFiles = useCallback((selected: FileList | null) => {
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
        setPreviews((p) => [...p, ""]);
      }
    });
  }, []);

  const removeFile = (idx: number) => {
    setFiles((f) => f.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const handleScan = async (list: File[]) => {
    if (list.length === 0) return;
    setScanning(true);
    try {
      const payload = await Promise.all(
        list.map(async (f) => ({
          base64: await fileToBase64(f),
          mimeType: f.type || "application/octet-stream",
        }))
      );

      const auth = (await supabase.auth.getUser()).data.user?.id;
      let attachment_url: string | undefined;
      let attachment_path: string | undefined;
      try {
        const first = list[0];
        const ext = first.name.split(".").pop() || "bin";
        const path = `${auth || "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from("bill-attachments").upload(path, first, {
          contentType: first.type,
          upsert: false,
        });
        if (!up.error) {
          attachment_path = up.data.path;
          const signed = await supabase.storage
            .from("bill-attachments")
            .createSignedUrl(up.data.path, 60 * 60 * 24 * 7);
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
        toast.warning(
          "This looks like a stock/inventory invoice — consider using the Procurement scanner instead."
        );
      }
      parsed.attachment_url = attachment_url;
      parsed.attachment_path = attachment_path;

      toast.success("Bill scanned. Review the details before saving.");
      onParsed(parsed);
      reset();
    } catch (e: any) {
      toast.error("Scan failed: " + (e?.message || e));
    } finally {
      setScanning(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (scanning) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length === 0) return;
    for (const f of dropped) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is too large (max 15 MB)`);
        return;
      }
    }
    // Auto-scan on drop for the fastest path.
    void handleScan(dropped);
  };

  const openPicker = () => {
    if (scanning) return;
    inputRef.current?.click();
  };

  return (
    <div className="card-glass rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Scan Bill
        </h3>
        {files.length > 0 && !scanning && (
          <button
            onClick={reset}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {scanning ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Scanning bill with AI…</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={openPicker}
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
            }`}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop a bill here or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, PDF (max 15MB)</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list && list.length > 0) {
                void handleScan(Array.from(list));
              }
              e.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list && list.length > 0) {
                void handleScan(Array.from(list));
              }
              e.target.value = "";
            }}
          />

          <div className="text-center">
            <span className="text-xs text-muted-foreground">or</span>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => cameraRef.current?.click()}
            disabled={scanning}
          >
            <Camera className="h-4 w-4 mr-2" />
            Take Photo with Camera
          </Button>

          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-auto">
              {files.map((f, idx) => (
                <div key={idx} className="relative border rounded p-2 bg-muted/30">
                  <button
                    className="absolute top-1 right-1 bg-background border rounded-full p-0.5"
                    onClick={() => removeFile(idx)}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {previews[idx] ? (
                    <img src={previews[idx]} alt={f.name} className="w-full h-20 object-cover rounded" />
                  ) : (
                    <div className="h-20 flex items-center justify-center text-muted-foreground">
                      <FileText className="h-8 w-8" />
                    </div>
                  )}
                  <div className="text-xs mt-1 truncate" title={f.name}>
                    {f.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
