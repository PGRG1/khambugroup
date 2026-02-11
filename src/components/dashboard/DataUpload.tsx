import { useCallback, useState } from "react";
import { Upload, X, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { SalesRecord } from "@/types/sales";
import { parseExcelRow } from "@/utils/salesUtils";

interface DataUploadProps {
  onUpload: (records: SalesRecord[]) => void;
  onClose: () => void;
}

const DataUpload = ({ onUpload, onClose }: DataUploadProps) => {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string>("");

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        // Skip header row
        const records = rows.slice(1)
          .map(parseExcelRow)
          .filter((r): r is SalesRecord => r !== null);

        if (records.length === 0) {
          setStatus("No valid records found. Check column format.");
          return;
        }

        onUpload(records);
        setStatus(`Successfully imported ${records.length} records.`);
        setTimeout(onClose, 1500);
      } catch {
        setStatus("Error reading file. Please check the format.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [onUpload, onClose]);

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
    </div>
  );
};

export default DataUpload;
