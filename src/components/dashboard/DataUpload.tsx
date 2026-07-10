import { useCallback, useState } from "react";
import { Upload, X, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import readXlsxFile from "read-excel-file";
import { SalesRecord } from "@/types/sales";
import { parseExcelRow } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface DataUploadProps {
  onUpload: (records: SalesRecord[]) => void;
  onClose: () => void;
}

type Rejection = { row: number; reason: string; venue?: string; date?: string };

const DataUpload = ({ onUpload, onClose }: DataUploadProps) => {
  const { venues } = useVenues();
  const activeVenueNames = venues.filter((v) => v.is_active).map((v) => v.name);

  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>("");
  const [pending, setPending] = useState<{ records: SalesRecord[]; rejections: Rejection[]; fileName: string } | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError("");
      setPending(null);
      if (file.size > MAX_FILE_SIZE) {
        setError("File exceeds 10MB limit.");
        return;
      }
      try {
        const rows = await readXlsxFile(file);
        const dataRows = rows.slice(1);
        const records: SalesRecord[] = [];
        const rejections: Rejection[] = [];
        dataRows.forEach((row, idx) => {
          const res = parseExcelRow(row as any[], activeVenueNames);
          if (res.ok === true) {
            records.push(res.record);
          } else {
            rejections.push({ row: idx + 2, reason: res.reason, venue: res.venue, date: res.date });
          }
        });
        if (records.length === 0 && rejections.length === 0) {
          setError("No data rows found in the file.");
          return;
        }
        setPending({ records, rejections, fileName: file.name });
      } catch {
        setError("Could not read file. Please check the format.");
      }
    },
    [activeVenueNames],
  );

  const handleConfirm = () => {
    if (!pending) return;
    onUpload(pending.records);
    setPending(null);
    setTimeout(onClose, 800);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  return (
    <div className="card-glass rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Upload Sales Data
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!pending && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
          }`}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".xlsx,.xls,.csv";
            input.onchange = (e: any) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            };
            input.click();
          }}
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop your Excel file here or <span className="text-primary font-medium">click to browse</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv · Recognised venues: {activeVenueNames.join(", ") || "none configured"}</p>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      {pending && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="text-foreground font-medium">
                {pending.records.length} record{pending.records.length === 1 ? "" : "s"} ready from "{pending.fileName}"
              </div>
              {pending.rejections.length > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {pending.rejections.length} row{pending.rejections.length === 1 ? "" : "s"} rejected — see below.
                </div>
              )}
            </div>
          </div>

          {pending.rejections.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-center gap-2 text-sm text-warning font-medium mb-2">
                <AlertTriangle className="h-4 w-4" />
                Rejected rows ({pending.rejections.length})
              </div>
              <div className="max-h-52 overflow-auto text-xs space-y-1">
                {pending.rejections.slice(0, 100).map((r) => (
                  <div key={r.row} className="flex gap-2 text-muted-foreground">
                    <span className="td-num tabular-nums text-foreground/70 shrink-0 w-14">Row {r.row}</span>
                    <span className="truncate">
                      {r.reason}
                      {r.date ? ` · ${r.date}` : ""}
                    </span>
                  </div>
                ))}
                {pending.rejections.length > 100 && (
                  <div className="text-muted-foreground italic">…and {pending.rejections.length - 100} more.</div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Fix these rows in the spreadsheet (or add missing venues in the Venues master) and re-upload. They will not be imported.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={pending.records.length === 0}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Import {pending.records.length} record{pending.records.length === 1 ? "" : "s"}
            </button>
            <button
              onClick={() => setPending(null)}
              className="px-4 py-2.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataUpload;
