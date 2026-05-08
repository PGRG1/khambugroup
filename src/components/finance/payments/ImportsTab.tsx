import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "@/utils/format";
import type { PaymentProcessor, SettlementImport } from "@/hooks/usePaymentSettlements";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export function ImportsTab({
  processor,
  imports,
  onChanged,
}: {
  processor: PaymentProcessor | null;
  imports: SettlementImport[];
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const filtered = processor ? imports.filter((i) => i.processor_id === processor.id) : [];

  const handleUpload = async (file: File) => {
    if (!processor) return;
    if (file.size > MAX_SIZE) {
      toast({ title: "File too large (max 100 MB)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `${processor.type}/${stamp}_${file.name}`;
      const up = await supabase.storage.from("payment-statements").upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      // Try to infer period from filename "MM-YYYY"
      const m = file.name.match(/(\d{2})[-_](\d{4})/);
      let periodStart = new Date().toISOString().slice(0, 10);
      let periodEnd = periodStart;
      if (m) {
        const mm = parseInt(m[1], 10), yy = parseInt(m[2], 10);
        const start = new Date(yy, mm - 1, 1);
        const end = new Date(yy, mm, 0);
        periodStart = start.toISOString().slice(0, 10);
        periodEnd = end.toISOString().slice(0, 10);
      }

      const { error } = await supabase.from("payment_settlement_imports" as any).insert({
        processor_id: processor.id,
        period_start: periodStart,
        period_end: periodEnd,
        currency: "HKD",
        file_url: path,
        file_name: file.name,
        uploaded_by: user?.id ?? null,
        status: "uploaded",
      });
      if (error) throw error;
      toast({ title: "Statement uploaded", description: "Parsing will be added in the next phase." });
      onChanged();
    } catch (e: any) {
      toast({ title: e.message || "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDownload = async (imp: SettlementImport) => {
    if (!imp.file_url) return;
    const { data } = await supabase.storage.from("payment-statements").createSignedUrl(imp.file_url, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (imp: SettlementImport) => {
    if (!confirm("Delete this import? Linked batches and lines will be removed.")) return;
    if (imp.file_url) await supabase.storage.from("payment-statements").remove([imp.file_url]);
    const { error } = await supabase.from("payment_settlement_imports" as any).delete().eq("id", imp.id);
    if (error) return toast({ title: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Statement imports</h3>
          <p className="text-xs text-muted-foreground">
            Upload monthly settlement reports (PDF or XLSX). The file is stored securely; an automated parser will
            be added in the next phase.
          </p>
        </div>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!processor || busy}>
          <Upload className="h-4 w-4 mr-1" /> {busy ? "Uploading…" : "Upload statement"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
      </div>

      <Card className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Period</th>
                <th className="text-left px-3 py-2">File</th>
                <th className="text-left px-3 py-2">Uploaded</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No imports yet</td></tr>
              )}
              {filtered.map((i) => (
                <tr key={i.id} className="border-t border-border/40 hover:bg-muted/30">
                  <td className="px-3 py-2">{format.date(i.period_start)} – {format.date(i.period_end)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      {i.file_name || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{format.date(i.uploaded_at)}</td>
                  <td className="px-3 py-2"><span className="chip chip-info">{i.status}</span></td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => handleDownload(i)}><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
