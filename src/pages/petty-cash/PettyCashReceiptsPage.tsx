import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Receipt as ReceiptIcon, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/salesUtils";
import { usePettyCash, type PettyReceipt } from "@/hooks/usePettyCash";
import { PettyCashHeader, StatusBadge, fmtDate } from "./_shared";

export default function PettyCashReceiptsPage() {
  const pc = usePettyCash();
  const [floatId, setFloatId] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [classificationId, setClassificationId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);

  // Default floatId once floats load
  if (!floatId && pc.floats[0]?.id) setFloatId(pc.floats[0].id);

  const canSubmit = floatId && amount && Number(amount) > 0 && description.trim() && classificationId;

  const submit = async () => {
    if (!canSubmit || !pc.tenantId) return;
    setSaving(true);
    try {
      let receiptPath: string | null = null;
      let receiptUrl: string | null = null;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (file && uid) {
        const path = `${uid}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("petty-cash-receipts").upload(path, file);
        if (upErr) throw upErr;
        receiptPath = path;
        const { data: signed } = await supabase.storage.from("petty-cash-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
        receiptUrl = signed?.signedUrl ?? null;
      }

      const { error } = await supabase.from("petty_cash_receipts").insert({
        tenant_id: pc.tenantId,
        float_id: floatId,
        receipt_date: receiptDate,
        amount: Number(amount),
        description: description.trim(),
        classification_id: classificationId,
        receipt_url: receiptUrl,
        receipt_path: receiptPath,
        notes: notes.trim() || null,
        status: "pending",
        created_by: uid ?? null,
      } as any);
      if (error) throw error;
      toast.success("Receipt recorded");
      setAmount(""); setDescription(""); setNotes(""); setFile(null);
      pc.reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to save receipt");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (r: PettyReceipt) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("petty_cash_receipts")
      .update({ status: "approved", approved_by: userData.user?.id ?? null, approved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Approved"); pc.reload();
  };

  const reject = async (r: PettyReceipt) => {
    const { error } = await supabase.from("petty_cash_receipts").update({ status: "rejected" }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rejected"); pc.reload();
  };

  const post = async (r: PettyReceipt) => {
    setPostingId(r.id);
    try {
      await pc.postReceipt(r);
      toast.success("Posted to GL");
    } catch (e: any) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPostingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PettyCashHeader title="Petty Cash Receipts" subtitle="Record, approve and post cash receipts." />

      {pc.loading ? (
        <Card className="card-glass p-10 text-center text-muted-foreground">Loading…</Card>
      ) : (
        <>
          <Card className="card-glass p-4">
            <div className="flex items-center gap-2 mb-3">
              <ReceiptIcon className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Record a receipt</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-1">
                <Label className="text-xs">Float</Label>
                <Select value={floatId} onValueChange={setFloatId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {pc.floats.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Taxi fare to supplier" />
              </div>
              <div>
                <Label className="text-xs">Classification</Label>
                <Select value={classificationId} onValueChange={setClassificationId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {pc.classifications.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Photo / PDF</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="md:col-span-1 flex items-end">
                <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
                  <Plus className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Add"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="card-glass p-4">
            <h2 className="text-sm font-semibold mb-3">All receipts</h2>
            {pc.receipts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No receipts yet.</div>
            ) : (
              <div className="text-sm overflow-x-auto">
                <div className="grid grid-cols-[90px_120px_1fr_160px_100px_90px_240px] gap-3 text-xs text-muted-foreground border-b border-border pb-2 min-w-[900px]">
                  <span>Date</span><span>Float</span><span>Description</span><span>Classification</span>
                  <span className="text-right">Amount</span><span className="text-right">Status</span><span className="text-right">Actions</span>
                </div>
                {pc.receipts.map((r) => {
                  const cls = pc.classifications.find((c) => c.id === r.classification_id);
                  const flt = pc.floats.find((f) => f.id === r.float_id);
                  return (
                    <div key={r.id} className="grid grid-cols-[90px_120px_1fr_160px_100px_90px_240px] gap-3 py-2 border-b border-border/50 items-center min-w-[900px]">
                      <span className="text-xs">{fmtDate(r.receipt_date)}</span>
                      <span className="truncate">{flt?.name ?? "—"}</span>
                      <span className="truncate">{r.description}</span>
                      <span className="text-xs">{cls?.name ?? "—"}</span>
                      <span className="text-right">{formatCurrency(r.amount)}</span>
                      <span className="text-right"><StatusBadge status={r.status} /></span>
                      <div className="flex justify-end gap-1">
                        {r.receipt_url && (
                          <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline px-2">View</a>
                        )}
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => approve(r)}><Check className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" onClick={() => reject(r)}><X className="h-3 w-3" /></Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" onClick={() => post(r)} disabled={postingId === r.id}>
                            {postingId === r.id ? "Posting…" : "Post to GL"}
                          </Button>
                        )}
                        {r.status === "posted" && <Badge variant="outline" className="text-[10px]">JE #{r.journal_entry_id?.slice(0, 6)}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
