import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload, Camera, Loader2, FileText, X, Sparkles, CheckCircle2, AlertCircle, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { useStaffReimbursements } from "@/hooks/useStaffReimbursements";
import { fmtHK, StatusPill } from "@/components/expenses/shared";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT =
  "image/*,application/pdf," +
  ".xlsx,.xls," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel," +
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(((r.result as string).split(",")[1]) || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type ExtractedClaim = {
  claimant_name: string;
  description: string;
  amount: number;
  claim_date: string;
  suggested_category_id: string;
  confidence: "high" | "medium" | "low";
  source_hint: string;
};

type ReviewRow = ExtractedClaim & {
  category_id: string;
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
};

export default function ReimbursementAiImport({
  open, onOpenChange, sr,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sr: ReturnType<typeof useStaffReimbursements>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "review">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [sharedAttachment, setSharedAttachment] = useState<{ url: string | null; path: string | null }>({
    url: null, path: null,
  });

  const reset = () => {
    setStep("upload");
    setFiles([]);
    setPreviews([]);
    setScanning(false);
    setRows([]);
    setSavingAll(false);
    setSharedAttachment({ url: null, path: null });
  };

  const close = (o: boolean) => {
    if (scanning || savingAll) return;
    if (!o) reset();
    onOpenChange(o);
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
    setFiles(prev => [...prev, ...arr]);
    arr.forEach(f => {
      if (f.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = () => setPreviews(p => [...p, r.result as string]);
        r.readAsDataURL(f);
      } else {
        setPreviews(p => [...p, ""]);
      }
    });
  };

  const removeFile = (idx: number) => {
    setFiles(f => f.filter((_, i) => i !== idx));
    setPreviews(p => p.filter((_, i) => i !== idx));
  };

  const runExtraction = async () => {
    if (files.length === 0 || !sr.tenantId) return;
    setScanning(true);
    try {
      // Upload first file as shared attachment (non-fatal on failure).
      let attachment_url: string | null = null;
      let attachment_path: string | null = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (uid) {
          const first = files[0];
          const safeName = first.name.replace(/[^A-Za-z0-9._-]/g, "_");
          const path = `staff-reimbursements/${uid}/${Date.now()}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("petty-cash-receipts")
            .upload(path, first, { contentType: first.type, upsert: false });
          if (!upErr) {
            attachment_path = path;
            const { data: signed } = await supabase.storage
              .from("petty-cash-receipts")
              .createSignedUrl(path, 60 * 60 * 24 * 365);
            attachment_url = signed?.signedUrl ?? null;
          }
        }
      } catch (e) {
        console.warn("Attachment upload failed (non-fatal):", e);
      }
      setSharedAttachment({ url: attachment_url, path: attachment_path });

      const payload = await Promise.all(files.map(async f => ({
        base64: await fileToBase64(f),
        mimeType: f.type || "application/octet-stream",
        filename: f.name,
      })));
      const categories = sr.classifications
        .filter(c => c.is_active)
        .map(c => ({ id: c.id, name: c.name, financial_type: c.financial_type }));

      const { data, error } = await supabase.functions.invoke("parse-staff-reimbursement", {
        body: { files: payload, categories },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Extraction failed");

      const claims: ExtractedClaim[] = Array.isArray(data.claims) ? data.claims : [];
      if (claims.length === 0) {
        toast.warning("AI didn't find any claims in the document(s).");
        setScanning(false);
        return;
      }
      const firstCatId = categories[0]?.id ?? "";
      const today = new Date().toISOString().slice(0, 10);
      setRows(claims.map(c => ({
        ...c,
        category_id: c.suggested_category_id || firstCatId,
        claim_date: c.claim_date || today,
        status: "pending" as const,
      })));
      if (Array.isArray(data.warnings) && data.warnings.length) {
        for (const w of data.warnings) toast.warning(w);
      }
      toast.success(`AI extracted ${claims.length} claim${claims.length === 1 ? "" : "s"}. Review before saving.`);
      setStep("review");
    } catch (e: any) {
      toast.error("Extraction failed: " + (e?.message || e));
    } finally {
      setScanning(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<ReviewRow>) =>
    setRows(rs => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const removeRow = (idx: number) =>
    setRows(rs => rs.filter((_, i) => i !== idx));

  const validate = (r: ReviewRow): string | null => {
    if (!r.claimant_name.trim()) return "Claimant required";
    if (!r.description.trim()) return "Description required";
    if (!r.category_id) return "Category required";
    if (!(r.amount > 0)) return "Amount must be > 0";
    if (!r.claim_date) return "Date required";
    return null;
  };

  const saveRow = async (idx: number) => {
    const row = rows[idx];
    if (!row) return;
    const err = validate(row);
    if (err) { updateRow(idx, { status: "error", error: err }); return; }
    updateRow(idx, { status: "saving", error: undefined });
    try {
      await sr.createClaim({
        claimant_name: row.claimant_name,
        description: row.description,
        category_id: row.category_id,
        amount: row.amount,
        claim_date: row.claim_date,
        receipt_url: sharedAttachment.url,
        receipt_path: sharedAttachment.path,
      });
      updateRow(idx, { status: "saved" });
    } catch (e: any) {
      updateRow(idx, { status: "error", error: e?.message || "Save failed" });
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === "saved") continue;
      // eslint-disable-next-line no-await-in-loop
      await saveRow(i);
    }
    setSavingAll(false);
    const stillPending = rows.some(r => r.status !== "saved");
    if (!stillPending) toast.success("All claims saved and posted to GL.");
  };

  const allSaved = rows.length > 0 && rows.every(r => r.status === "saved");

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Import — Staff Reimbursements
          </DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? "Upload receipts, an expense sheet (Excel), a Word doc, or a PDF. AI will extract each claim for you to review."
              : "Review each proposed claim. Edit anything before saving. Each saved row posts the accrual journal automatically."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 overflow-y-auto">
            <div
              onDragOver={(e) => { e.preventDefault(); if (!scanning) setDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                if (scanning) return;
                handleFiles(e.dataTransfer.files);
              }}
              className={
                "rounded-lg border-2 border-dashed p-4 transition-colors " +
                (dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20")
              }
            >
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={scanning}>
                  <Upload className="h-4 w-4 mr-2" /> Choose files
                </Button>
                <Button variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning}>
                  <Camera className="h-4 w-4 mr-2" /> Camera
                </Button>
                <input
                  ref={inputRef} type="file" multiple accept={ACCEPT}
                  className="hidden" onChange={(e) => handleFiles(e.target.files)}
                />
                <input
                  ref={cameraRef} type="file" accept="image/*" capture="environment"
                  className="hidden" onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Images, PDF, Excel (.xlsx/.xls) or Word (.docx). Max 15 MB each.
              </p>
            </div>

            {files.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-auto">
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
                    <div className="text-[11px] mt-1 truncate" title={f.name}>{f.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="overflow-y-auto space-y-2">
            {rows.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                All rows removed. Go back to upload another document.
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r, idx) => {
                  const disabled = r.status === "saving" || r.status === "saved";
                  return (
                    <div
                      key={idx}
                      className={
                        "border rounded-lg p-3 " +
                        (r.status === "saved" ? "border-primary/40 bg-primary/5"
                          : r.status === "error" ? "border-destructive/40 bg-destructive/5"
                          : "border-border/60 bg-muted/20")
                      }
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                            Row {idx + 1}
                          </span>
                          {r.source_hint && (
                            <span className="text-[11px] text-muted-foreground">· {r.source_hint}</span>
                          )}
                          <ConfidencePill confidence={r.confidence} />
                          {r.status === "saved" && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                              <CheckCircle2 className="h-3 w-3" /> Saved
                            </span>
                          )}
                          {r.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                              <AlertCircle className="h-3 w-3" /> {r.error}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm" variant="outline"
                            disabled={disabled}
                            onClick={() => saveRow(idx)}
                          >
                            {r.status === "saving" ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving</>
                            ) : "Save"}
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            disabled={disabled}
                            onClick={() => removeRow(idx)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                        <div className="sm:col-span-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Claimant</Label>
                          <Input
                            disabled={disabled}
                            value={r.claimant_name}
                            onChange={(e) => updateRow(idx, { claimant_name: e.target.value, status: "pending", error: undefined })}
                            placeholder="Name…"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</Label>
                          <Input
                            disabled={disabled}
                            value={r.description}
                            onChange={(e) => updateRow(idx, { description: e.target.value, status: "pending", error: undefined })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</Label>
                          <Select
                            value={r.category_id}
                            onValueChange={(v) => updateRow(idx, { category_id: v, status: "pending", error: undefined })}
                            disabled={disabled}
                          >
                            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                              {sr.classifications.filter(c => c.is_active).map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name} · {c.financial_type.toUpperCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount (HK$)</Label>
                          <Input
                            disabled={disabled}
                            type="number" step="0.01" min="0"
                            value={r.amount || ""}
                            onChange={(e) => updateRow(idx, { amount: Number(e.target.value), status: "pending", error: undefined })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</Label>
                          <Input
                            disabled={disabled}
                            type="date"
                            value={r.claim_date}
                            onChange={(e) => updateRow(idx, { claim_date: e.target.value, status: "pending", error: undefined })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {rows.length > 0 && (
              <div className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                Total: {fmtHK(rows.reduce((s, r) => s + Number(r.amount || 0), 0))} across {rows.length} claim(s)
                {sharedAttachment.url && " · original attached to every saved claim"}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          {step === "upload" ? (
            <>
              <Button variant="ghost" onClick={() => close(false)} disabled={scanning}>Cancel</Button>
              <Button onClick={runExtraction} disabled={scanning || files.length === 0}>
                {scanning ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Extract with AI</>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={savingAll}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                variant="outline"
                onClick={() => { sr.reload(); close(false); }}
                disabled={savingAll}
              >
                {allSaved ? "Done" : "Close"}
              </Button>
              <Button
                onClick={saveAll}
                disabled={savingAll || rows.length === 0 || allSaved}
              >
                {savingAll ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                ) : `Save All (${rows.filter(r => r.status !== "saved").length})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfidencePill({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const variant = confidence === "high" ? "success" : confidence === "medium" ? "info" : "warning";
  return (
    <StatusPill variant={variant as any} className="text-[10px] px-1.5 py-0">
      {confidence}
    </StatusPill>
  );
}
