import { useState } from "react";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import ReceiptScanner from "@/components/dashboard/ReceiptScanner";
import DataTable from "@/components/dashboard/DataTable";
import ResetDataButton from "@/components/dashboard/ResetDataButton";
import { Upload, PenLine, ScanLine } from "lucide-react";

const DataPage = () => {
  const { data, loading, uploadRecords, addRecord, updateRecord, deleteRecord, attachReceipt, refetch } = useSalesData();
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const hideUpload = isActionHidden("data.upload");
  const hideScanReceipt = isActionHidden("data.scan_receipt");
  const hideManualEntry = isActionHidden("data.manual_entry");
  const hideEditRows = isActionHidden("data.edit_rows");
  const hideDeleteRows = isActionHidden("data.delete_rows");
  const hideReset = isActionHidden("data.reset");

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

  const canEdit = isAdmin && !hideEditRows;
  const canDelete = isAdmin && !hideDeleteRows;

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">Sales Data</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{data.length} records</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3 flex-wrap">
            {!hideUpload && (
              <button
                onClick={() => { setShowUpload(!showUpload); setShowManual(false); setShowScanner(false); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  showUpload ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload Data
              </button>
            )}
            {!hideScanReceipt && (
              <button
                onClick={() => { setShowScanner(!showScanner); setShowUpload(false); setShowManual(false); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  showScanner ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                <ScanLine className="h-4 w-4" />
                Scan Receipt
              </button>
            )}
            {!hideManualEntry && (
              <button
                onClick={() => { setShowManual(!showManual); setShowUpload(false); setShowScanner(false); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  showManual ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                <PenLine className="h-4 w-4" />
                Manual Entry
              </button>
            )}
            {!hideReset && <ResetDataButton onReset={refetch} />}
          </div>
        )}
      </div>

      {isAdmin && !hideUpload && showUpload && (
        <DataUpload onUpload={async (records) => { await uploadRecords(records); }} onClose={() => setShowUpload(false)} />
      )}
      {isAdmin && !hideScanReceipt && showScanner && (
        <ReceiptScanner onSave={async (record, file) => { await addRecord(record, file); }} onClose={() => setShowScanner(false)} />
      )}
      {isAdmin && !hideManualEntry && showManual && (
        <ManualInput onAdd={async (record) => { await addRecord(record); }} onClose={() => setShowManual(false)} />
      )}

      <DataTable data={data} onUpdate={canEdit ? handleUpdateRecord : undefined} onDelete={canDelete ? handleDeleteRecord : undefined} />
    </div>
  );
};

export default DataPage;
