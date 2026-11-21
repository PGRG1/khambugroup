import { useCallback, useRef, useState } from "react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { Upload, X, ScanLine, Camera, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ScannedBill } from "./BillScanner";
import { readBillFiles } from "@/utils/billFromScan";

export type { ScannedBill } from "./BillScanner";

const MAX_BYTES = 15 * 1024 * 1024;


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
      // Same read as the Bani chat (src/utils/billFromScan.ts).
      const parsed = await readBillFiles(list);
      if (parsed.suggested_document_type === "procurement_invoice") {
        toast.warning(
          "This looks like a stock/inventory invoice — consider using the Procurement scanner instead."
        );
      }

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
    <div className="space-y-3">
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
        <div className="flex min-h-[260px] flex-col items-center justify-center pb-8">
          <BaniProcessingMark size={24} />
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
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF or forwarded email (.eml), max 15MB</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.eml,message/rfc822"
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
