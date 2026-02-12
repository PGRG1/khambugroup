import { useCallback, useState } from "react";
import { Upload, X, FileSpreadsheet } from "lucide-react";
import readXlsxFile from "read-excel-file";
import { SalesRecord } from "@/types/sales";
import { parseExcelRow } from "@/utils/salesUtils";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface DataUploadProps {
  onUpload: (records: SalesRecord[]) => void;
  onClose: () => void;
}

const DataUpload = ({ onUpload, onClose }: DataUploadProps) => {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [pendingRecords, setPendingRecords] = useState<SalesRecord[] | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setStatus("Error: File exceeds 10MB limit.");
      return;
    }
    setFileName(file.name);
    try {
      const rows = await readXlsxFile(file);
      // Skip header row
      const records = rows.slice(1)
        .map((row) => parseExcelRow(row as any[]))
        .filter((r): r is SalesRecord => r !== null);

      if (records.length === 0) {
        setStatus("No valid records found. Check column format.");
        return;
      }

      setPendingRecords(records);
      setStatus(`${records.length} records ready to upload from "${file.name}".`);
    } catch {
      setStatus("Error reading file. Please check the format.");
    }
  }, []);

  const handleConfirmUpload = () => {
    if (pendingRecords) {
      onUpload(pendingRecords);
      setStatus(`Successfully imported ${pendingRecords.length} records.`);
      setPendingRecords(null);
      setTimeout(onClose, 1500);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

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
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
        <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
      </div>
      {status && (
        <p className={`mt-3 text-sm ${status.includes("Error") || status.includes("No valid") ? "text-destructive" : "text-primary"}`}>
          {status}
        </p>
      )}
      {pendingRecords && (
        <button
          onClick={handleConfirmUpload}
          className="mt-3 w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Upload Data ({pendingRecords.length} records)
        </button>
      )}
    </div>
  );
};

export default DataUpload;
