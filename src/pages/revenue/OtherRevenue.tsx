import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Coins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/salesUtils";
import { fmtDate } from "@/utils/format";
import { useManualRevenue, type ManualRevenueEntry } from "@/hooks/useManualRevenue";
import { useVenues } from "@/hooks/useVenues";
import { useRevenueSources } from "@/hooks/useRevenueSources";

const NONE = "__none__";

export default function OtherRevenuePage() {
  const mr = useManualRevenue();
  const { venues } = useVenues();
  const { sources } = useRevenueSources();
  const activeSources = sources.filter((s) => s.is_active);

  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [venueId, setVenueId] = useState<string>(NONE);
  const [sourceId, setSourceId] = useState<string>(NONE);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);

  const canSubmit = amount && Number(amount) > 0 && description.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || !mr.tenantId) return;
    setSaving(true);
    try {
      let receiptPath: string | null = null;
      let receiptUrl: string | null = null;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (file && uid) {
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${uid}/manual-revenue/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("petty-cash-receipts").upload(path, file);
        if (upErr) throw upErr;
        receiptPath = path;
        const { data: signed } = await supabase.storage.from("petty-cash-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
        receiptUrl = signed?.signedUrl ?? null;
      }

      const { error } = await supabase.from("manual_revenue_entries").insert({
        tenant_id: mr.tenantId,
        entry_date: entryDate,
        amount: Number(amount),
        description: description.trim(),
        venue_id: venueId === NONE ? null : venueId,
        revenue_source_id: sourceId === NONE ? null : sourceId,
        receipt_url: receiptUrl,
        receipt_path: receiptPath,
        status: "draft",
        created_by: uid ?? null,
      } as any);
      if (error) throw error;
      toast.success("Entry saved");
      setAmount(""); setDescription(""); setFile(null); setVenueId(NONE); setSourceId(NONE);
      mr.reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const post = async (row: ManualRevenueEntry) => {
    setPostingId(row.id);
    try {
      await mr.postEntry(row);
      toast.success("Posted to GL");
    } catch (e: any) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPostingId(null);
    }
  };

  const remove = async (row: ManualRevenueEntry) => {
    if (row.status === "posted") { toast.error("Cannot delete a posted entry"); return; }
    if (!mr.tenantId) return;
    const { error } = await supabase.from("manual_revenue_entries").delete().eq("id", row.id).eq("tenant_id", mr.tenantId);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    mr.reload();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Other Revenue</h1>
        <p className="text-sm text-muted-foreground">
          Log revenue that happened outside POS (e.g. a private event paid in cash). Saved as a draft, then posted to the general ledger.
        </p>
        {mr.defaultRevenueAccount && (
          <p className="text-xs text-muted-foreground mt-1">
            Posts to <span className="font-mono">{mr.defaultRevenueAccount.code} {mr.defaultRevenueAccount.name}</span>
            {mr.defaultCashAccount && <> against <span className="font-mono">{mr.defaultCashAccount.code} {mr.defaultCashAccount.name}</span></>}.
          </p>
        )}
      </div>

      <Card className="card-glass p-4">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Record other revenue</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Label / Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Private event — bank transfer" />
          </div>
          <div>
            <Label className="text-xs">Venue (optional)</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Source (optional)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {activeSources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">Receipt (optional)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="md:col-span-2 flex items-end">
            <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
              <Plus className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="card-glass p-4">
        <h2 className="text-sm font-semibold mb-3">All entries</h2>
        {mr.loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : mr.entries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No entries yet.</div>
        ) : (
          <div className="text-sm overflow-x-auto">
            <div className="grid grid-cols-[90px_1fr_140px_140px_110px_90px_200px] gap-3 text-xs text-muted-foreground border-b border-border pb-2 min-w-[900px]">
              <span>Date</span><span>Label</span><span>Venue</span><span>Source</span>
              <span className="text-right">Amount</span><span className="text-right">Status</span><span className="text-right">Actions</span>
            </div>
            {mr.entries.map((r) => {
              const venueName = venues.find((v) => v.id === r.venue_id)?.name;
              const sourceName = sources.find((s) => s.id === r.revenue_source_id)?.name;
              return (
                <div key={r.id} className="grid grid-cols-[90px_1fr_140px_140px_110px_90px_200px] gap-3 py-2 border-b border-border/50 items-center min-w-[900px]">
                  <span className="text-xs">{fmtDate(r.entry_date)}</span>
                  <span className="truncate">{r.description || "—"}</span>
                  <span className="truncate text-xs">{venueName ?? "—"}</span>
                  <span className="truncate text-xs">{sourceName ?? "—"}</span>
                  <span className="text-right td-num">{formatCurrency(r.amount)}</span>
                  <span className="text-right">
                    <Badge variant={r.status === "posted" ? "default" : "outline"} className="text-[10px]">
                      {r.status}
                    </Badge>
                  </span>
                  <div className="flex justify-end gap-1">
                    {r.receipt_url && (
                      <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline px-2 self-center">View</a>
                    )}
                    {r.status === "draft" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => remove(r)}>Delete</Button>
                        <Button size="sm" onClick={() => post(r)} disabled={postingId === r.id}>
                          {postingId === r.id ? "Posting…" : "Post to GL"}
                        </Button>
                      </>
                    )}
                    {r.status === "posted" && r.journal_entry_id && (
                      <Badge variant="outline" className="text-[10px]">JE #{r.journal_entry_id.slice(0, 6)}</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
