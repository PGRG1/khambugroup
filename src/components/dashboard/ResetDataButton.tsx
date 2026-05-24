import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ResetDataButtonProps {
  onReset: () => void;
}

const ResetDataButton = ({ onReset }: ResetDataButtonProps) => {
  const { isAdmin } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isAdmin) return null;

  const handleReset = async () => {
    if (!confirmed) return;
    setLoading(true);
    setError("");

    const { error: err } = await supabase
      .from("sales_records")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

    if (err) {
      setError(err.message);
    } else {
      onReset();
      setShowDialog(false);
      setConfirmed(false);
    }
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Reset All Data
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Reset All Data</h3>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-foreground">
                This action will <strong>permanently delete all sales records</strong> from the database. This cannot be undone.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>All uploaded sales data will be removed</li>
                <li>All manually entered records will be deleted</li>
                <li>Overview charts and KPIs will show no data</li>
                <li>Forecast comparisons will lose actual data references</li>
              </ul>
            </div>

            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <span className="text-sm text-foreground">
                I understand this will permanently delete all sales data and cannot be reversed.
              </span>
            </label>

            {error && <p className="text-sm text-destructive mb-3">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDialog(false); setConfirmed(false); setError(""); }}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={!confirmed || loading}
                className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? "Deleting..." : "Delete All Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ResetDataButton;
