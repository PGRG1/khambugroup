import { useState } from "react";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import ReceiptScanner from "@/components/dashboard/ReceiptScanner";
import DataTable from "@/components/dashboard/DataTable";
import ResetDataButton from "@/components/dashboard/ResetDataButton";
import { Upload, PenLine, ScanLine } from "lucide-react";

const DataPage = () => {
  const { data, loading, uploadRecords, addRecord, updateRecord, deleteRecord, refetch } = useSalesData();
  const { isAdmin } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleUpdateRecord = async (index: number, record: typeof data[0]) => {
    const oldRecord = data[index];
    if (oldRecord) await updateRecord(oldRecord, record);
  };

  const handleDeleteRecord = async (index: number) => {
    const record = data[index];
    if (record) await deleteRecord(record);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">Sales Data</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{data.length} records</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { setShowUpload(!showUpload); setShowManual(false); setShowScanner(false); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showUpload ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <Upload className="h-4 w-4" />
              Upload Data
            </button>
            <button
              onClick={() => { setShowScanner(!showScanner); setShowUpload(false); setShowManual(false); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showScanner ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <ScanLine className="h-4 w-4" />
              Scan Receipt
            </button>
            <button
              onClick={() => { setShowManual(!showManual); setShowUpload(false); setShowScanner(false); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showManual ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <PenLine className="h-4 w-4" />
              Manual Entry
            </button>
            <ResetDataButton onReset={refetch} />
          </div>
        )}
      </div>

      {isAdmin && showUpload && (
        <DataUpload onUpload={async (records) => { await uploadRecords(records); }} onClose={() => setShowUpload(false)} />
      )}
      {isAdmin && showScanner && (
        <ReceiptScanner onSave={async (record) => { await addRecord(record); }} onClose={() => setShowScanner(false)} />
      )}
      {isAdmin && showManual && (
        <ManualInput onAdd={async (record) => { await addRecord(record); }} onClose={() => setShowManual(false)} />
      )}

      <DataTable data={data} />
    </div>
  );
};

export default DataPage;
