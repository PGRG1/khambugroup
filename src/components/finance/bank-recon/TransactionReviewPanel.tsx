import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { BankTxn, BankAccount } from "@/hooks/useBankReconciliation";
import { formatCurrency } from "@/utils/salesUtils";
import { classifyTxn, SUGGESTED_TYPE_LABEL, type UserRule } from "@/utils/bankTxnRules";
import { ExternalLink, CheckCircle2, XCircle, FileQuestion, RotateCcw, ArrowLeftRight, Coins, Receipt, AlertTriangle, Sparkles } from "lucide-react";

type AuditRow = { id: string; ts: string; action: string; old_status: string | null; new_status: string | null; user_display_name: string | null; notes: any };

export function TransactionReviewPanel({
  txn, accounts, userRules, onClose, onChanged,
}: {
  txn: BankTxn | null;
  accounts: BankAccount[];
  userRules: UserRule[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<{ suggested_type?: string; suggested_category?: string; reason?: string; rule_pattern?: string; confidence?: number } | null>(null);

  useEffect(() => {
    if (!txn) return;
    setNotes(txn.notes || "");
    (async () => {
      const { data } = await supabase
        .from("bank_audit_trail" as any)
        .select("id, ts, action, old_status, new_status, user_display_name, notes")
        .eq("bank_transaction_id", txn.id)
        .order("ts", { ascending: false });
      setAudit((data as any) || []);

      // Get PDF link from import
      if (txn.import_id) {
        const { data: imp } = await supabase
          .from("bank_statement_imports")
          .select("file_url")
          .eq("id", txn.import_id)
          .single();
        if (imp?.file_url) {
          const { data: signed } = await supabase.storage.from("bank-statements").createSignedUrl(imp.file_url, 3600);
          if (signed) setPdfUrl(signed.signedUrl);
        }
      } else setPdfUrl(null);
    })();
  }, [txn?.id]);

  if (!txn) return null;
  const acct = accounts.find((a) => a.id === txn.bank_account_id);
  const cls = classifyTxn(txn.description, Number(txn.money_in), Number(txn.money_out), userRules);
  const amount = Number(txn.money_in) - Number(txn.money_out);

  const updateStatus = async (newStatus: string, action: string, extras: Record<string, any> = {}) => {
    setBusy(true);
    const oldStatus = txn.status;
    const { error } = await supabase
      .from("bank_transactions")
      .update({ status: newStatus, notes, ...extras })
      .eq("id", txn.id);
    if (error) { setBusy(false); toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    await supabase.from("bank_audit_trail" as any).insert({
      bank_account_id: txn.bank_account_id,
      bank_transaction_id: txn.id,
      action, old_status: oldStatus, new_status: newStatus,
      notes: { manual_notes: notes, ...extras },
    });
    toast({ title: "Updated" });
    setBusy(false);
    onChanged();
    onClose();
  };

  const runAi = async () => {
    setAiBusy(true);
    setAiResult(null);
    const { data, error } = await supabase.functions.invoke("classify-bank-txn", {
      body: { description: txn.description, money_in: Number(txn.money_in), money_out: Number(txn.money_out) },
    });
    setAiBusy(false);
    if (error) { toast({ title: "AI failed", description: error.message, variant: "destructive" }); return; }
    if ((data as any)?.error) { toast({ title: "AI failed", description: (data as any).error, variant: "destructive" }); return; }
    setAiResult(data as any);
  };

  const acceptAi = async (alsoSaveRule: boolean) => {
    if (!aiResult?.suggested_type) return;
    setBusy(true);
    const newStatus = aiResult.suggested_type === "bank_fee" ? "bank_fee" : "matched";
    const { error } = await supabase.from("bank_transactions").update({
      status: newStatus, notes,
      suggested_type: aiResult.suggested_type,
      suggested_category: aiResult.suggested_category ?? null,
    }).eq("id", txn.id);
    if (error) { setBusy(false); toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    await supabase.from("bank_audit_trail" as any).insert({
      bank_account_id: txn.bank_account_id, bank_transaction_id: txn.id,
      action: "ai_classify_accepted", old_status: txn.status, new_status: newStatus,
      notes: { manual_notes: notes, ai: aiResult },
    });
    if (alsoSaveRule && aiResult.rule_pattern && aiResult.rule_pattern.length >= 3) {
      const { error: rerr } = await supabase.from("bank_recon_rules" as any).insert({
        name: `AI: ${aiResult.rule_pattern.slice(0, 40)}`,
        match_contains: aiResult.rule_pattern.toUpperCase(),
        suggested_type: aiResult.suggested_type,
        suggested_category: aiResult.suggested_category ?? null,
        is_active: true, sort_order: 0,
      });
      if (rerr) toast({ title: "Rule save failed", description: rerr.message, variant: "destructive" });
      else toast({ title: "Rule saved — system learned this pattern" });
    } else {
      toast({ title: "Classification applied" });
    }
    setBusy(false);
    onChanged();
    onClose();
  };


  return (
    <Sheet open={!!txn} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Transaction Detail</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4 text-sm">
          <div className="border border-border rounded-md p-3 bg-card/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs">{txn.txn_date}{(txn as any).value_date && (txn as any).value_date !== txn.txn_date ? ` (val ${(txn as any).value_date})` : ""}</span>
              <span className={`td-num text-base font-semibold ${amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {amount >= 0 ? "+" : ""}{formatCurrency(amount)}
              </span>
            </div>
            <div className="text-muted-foreground text-xs mt-1">{acct?.account_name}</div>
          </div>

          <Section title="Raw bank description">
            <pre className="whitespace-pre-wrap font-mono text-xs bg-background/40 p-2 rounded border border-border">{txn.description}</pre>
          </Section>

          {(txn as any).counterparty && (
            <Section title="Cleaned counterparty"><div>{(txn as any).counterparty}</div></Section>
          )}
          {txn.reference && <Section title="Reference"><div className="font-mono text-xs">{txn.reference}</div></Section>}

          {pdfUrl && (
            <Section title="Source PDF">
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-emerald-400 inline-flex items-center gap-1 text-xs hover:underline">
                Open statement PDF{(txn as any).source_page ? ` (page ${(txn as any).source_page})` : ""} <ExternalLink className="h-3 w-3" />
              </a>
            </Section>
          )}

          <Section title="Suggested classification">
            {cls ? (
              <div>
                <div className="font-medium">{SUGGESTED_TYPE_LABEL[cls.suggested_type] || cls.suggested_type}</div>
                {cls.suggested_category && <div className="text-xs text-muted-foreground">→ {cls.suggested_category}</div>}
                <div className="text-xs text-muted-foreground mt-1">{cls.reason}</div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No automatic suggestion. Classify manually below.</div>
            )}
          </Section>

          <Section title="🤖 AI classification">
            <div className="space-y-2">
              <Button size="sm" variant="outline" onClick={runAi} disabled={aiBusy || busy} className="w-full">
                <Sparkles className="h-3 w-3" /> {aiBusy ? "Thinking…" : "Suggest with AI"}
              </Button>
              {aiResult?.suggested_type && (
                <div className="border border-border rounded-md p-2 bg-card/50 space-y-2">
                  <div>
                    <div className="font-medium">{SUGGESTED_TYPE_LABEL[aiResult.suggested_type] || aiResult.suggested_type}</div>
                    {aiResult.suggested_category && <div className="text-xs text-muted-foreground">→ {aiResult.suggested_category}</div>}
                    {typeof aiResult.confidence === "number" && <div className="text-xs text-muted-foreground">Confidence: {Math.round(aiResult.confidence * 100)}%</div>}
                    {aiResult.reason && <div className="text-xs text-muted-foreground mt-1">{aiResult.reason}</div>}
                    {aiResult.rule_pattern && <div className="text-xs mt-1">Pattern to remember: <span className="font-mono bg-background/40 px-1 rounded">{aiResult.rule_pattern}</span></div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => acceptAi(true)} disabled={busy} className="flex-1">Accept &amp; Teach</Button>
                    <Button size="sm" variant="outline" onClick={() => acceptAi(false)} disabled={busy} className="flex-1">Accept Once</Button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section title="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add review notes…" rows={2} />
          </Section>

          <Section title="Actions">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => updateStatus("matched", "confirm_match")} disabled={busy}><CheckCircle2 className="h-3 w-3" /> Confirm Match</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("unmatched", "reject_match")} disabled={busy}><XCircle className="h-3 w-3" /> Reject</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("transfer_pending", "mark_transfer")} disabled={busy}><ArrowLeftRight className="h-3 w-3" /> Internal Transfer</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("matched", "mark_reversal", { suggested_type: "reversal" })} disabled={busy}><RotateCcw className="h-3 w-3" /> Reversal</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("bank_fee", "mark_bank_fee", { suggested_type: "bank_fee" })} disabled={busy}><Receipt className="h-3 w-3" /> Bank Fee</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("matched", "mark_cash_deposit", { suggested_type: "cash_deposit" })} disabled={busy}><Coins className="h-3 w-3" /> Cash Deposit</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("needs_review", "mark_needs_review")} disabled={busy}><AlertTriangle className="h-3 w-3" /> Needs Review</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("ignored", "ignore")} disabled={busy}><FileQuestion className="h-3 w-3" /> Ignore</Button>
            </div>
          </Section>

          <Section title="Audit history">
            {audit.length === 0 ? (
              <div className="text-xs text-muted-foreground">No history yet.</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {audit.map((a) => (
                  <li key={a.id} className="border-l-2 border-border pl-2">
                    <span className="text-muted-foreground">{new Date(a.ts).toLocaleString()}</span> · <span className="font-medium">{a.action}</span>
                    {a.old_status !== a.new_status && <> · {a.old_status} → {a.new_status}</>}
                    {a.user_display_name && <> · {a.user_display_name}</>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      {children}
    </div>
  );
}
