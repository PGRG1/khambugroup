import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, ArrowRight, CheckCircle2 } from "lucide-react";
import { classifyTxn } from "@/utils/bankTxnRules";
import { loadReconMappingRules, matchReconRule } from "@/utils/reconciliationMappingRules";
import type { BankAccount } from "@/hooks/useBankReconciliation";
import { formatCurrency } from "@/utils/salesUtils";

type ExtractedTxn = {
  txn_date: string;
  value_date?: string | null;
  raw_description: string;
  cleaned_counterparty?: string;
  reference?: string | null;
  deposit: number;
  withdrawal: number;
  running_balance?: number | null;
  source_page?: number;
};

type ExtractedAccount = {
  account_type: string;
  account_number: string;
  account_number_last4?: string;
  currency: string;
  opening_balance: number;
  closing_balance: number;
  total_deposits?: number;
  total_withdrawals?: number;
  deposit_count?: number;
  withdrawal_count?: number;
  transactions: ExtractedTxn[];
};

type ExtractedStatement = {
  bank_name: string;
  company_name: string;
  statement_date: string;
  accounts: ExtractedAccount[];
};

type Mapping = { bank_account_id: string | "__create__" | "__skip__"; new_account_name?: string };

export function StatementUploadFlow({
  open, onClose, onCommitted, accounts, reload,
}: {
  open: boolean;
  onClose: () => void;
  onCommitted: () => void;
  accounts: BankAccount[];
  reload: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "saving" | "done">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedStatement | null>(null);
  const [mappings, setMappings] = useState<Record<number, Mapping>>({});
  const [filePath, setFilePath] = useState<string | null>(null);

  const reset = () => {
    setStep("upload"); setFile(null); setExtracted(null); setMappings({}); setFilePath(null); setExtracting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const startExtract = async () => {
    if (!file) return;
    setExtracting(true);

    try {
      // Upload PDF to private bucket
      const path = `${new Date().getFullYear()}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("bank-statements").upload(path, file, { upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      setFilePath(path);

      // Convert to base64
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
        body: { file_base64: b64, file_name: file.name, mime_type: file.type || "application/pdf" },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data.data) throw new Error(data?.error || "Extraction returned no data");

      const ex = data.data as ExtractedStatement;
      setExtracted(ex);

      // Pre-fill mappings based on saved mappings + last4 lookup
      const last4s = ex.accounts.map((a) => a.account_number_last4).filter(Boolean) as string[];
      let savedMap: Record<string, string> = {};
      if (last4s.length) {
        const { data: m } = await supabase
          .from("bank_statement_account_mappings" as any)
          .select("account_number_last4, bank_account_id, bank_name")
          .in("account_number_last4", last4s);
        if (m) savedMap = Object.fromEntries((m as any[]).map((r) => [`${r.bank_name}|${r.account_number_last4}`, r.bank_account_id]));
      }
      const init: Record<number, Mapping> = {};
      ex.accounts.forEach((a, i) => {
        const key = `${ex.bank_name}|${a.account_number_last4}`;
        const matchedById = savedMap[key];
        const matchedByLast4 = !matchedById && a.account_number_last4
          ? accounts.find((x) => x.account_number_last4 === a.account_number_last4)?.id
          : null;
        init[i] = { bank_account_id: matchedById || matchedByLast4 || "__create__", new_account_name: `${ex.bank_name} ${a.account_type}` };
      });
      setMappings(init);
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Extraction failed", description: e.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const commit = async () => {
    if (!extracted) return;
    setStep("saving");
    try {
      const reconRules = await loadReconMappingRules();
      for (let i = 0; i < extracted.accounts.length; i++) {
        const a = extracted.accounts[i];
        const m = mappings[i];
        if (!m || m.bank_account_id === "__skip__") continue;

        let bankAccountId = m.bank_account_id;
        if (bankAccountId === "__create__") {
          const { data: created, error: cErr } = await supabase
            .from("bank_accounts")
            .insert({
              account_name: m.new_account_name || `${extracted.bank_name} ${a.account_type}`,
              bank_name: extracted.bank_name,
              account_number_last4: a.account_number_last4 || "",
              account_type: a.account_type,
              currency: a.currency,
              opening_balance: a.opening_balance || 0,
              opening_date: extracted.statement_date,
            } as any)
            .select("id")
            .single();
          if (cErr || !created) throw new Error(`Create account failed: ${cErr?.message}`);
          bankAccountId = created.id;
        }

        // Save mapping for future uploads
        if (a.account_number_last4) {
          await supabase.from("bank_statement_account_mappings" as any).upsert({
            bank_name: extracted.bank_name,
            account_number_last4: a.account_number_last4,
            bank_account_id: bankAccountId,
          }, { onConflict: "bank_name,account_number_last4" } as any);
        }

        // Compute period
        const dates = a.transactions.map((t) => t.txn_date).filter(Boolean).sort();
        const periodStart = dates[0] || extracted.statement_date;
        const periodEnd = dates[dates.length - 1] || extracted.statement_date;

        const { data: imp, error: iErr } = await supabase
          .from("bank_statement_imports")
          .insert({
            bank_account_id: bankAccountId,
            period_start: periodStart,
            period_end: periodEnd,
            opening_balance: a.opening_balance || 0,
            closing_balance: a.closing_balance || 0,
            file_url: filePath,
            file_name: file?.name || null,
            status: "imported",
          })
          .select("id")
          .single();
        if (iErr || !imp) throw new Error(`Import row failed: ${iErr?.message}`);

        if (a.transactions.length) {
          const rows = a.transactions.map((t) => {
            const cls = classifyTxn(t.raw_description, t.deposit || 0, t.withdrawal || 0, []);
            return {
              import_id: imp.id,
              bank_account_id: bankAccountId,
              txn_date: t.txn_date,
              value_date: t.value_date || null,
              description: t.raw_description,
              counterparty: t.cleaned_counterparty || "",
              reference: t.reference || "",
              money_in: t.deposit || 0,
              money_out: t.withdrawal || 0,
              running_balance: t.running_balance ?? null,
              source_page: t.source_page ?? null,
              suggested_type: cls?.suggested_type || null,
              suggested_category: cls?.suggested_category || null,
              status: "unmatched",
            } as any;
          });
          // Batch insert in chunks
          for (let j = 0; j < rows.length; j += 200) {
            const chunk = rows.slice(j, j + 200);
            const { error: tErr } = await supabase.from("bank_transactions").insert(chunk);
            if (tErr) throw new Error(`Transactions insert failed: ${tErr.message}`);
          }
        }

        // Audit
        await supabase.from("bank_audit_trail" as any).insert({
          bank_account_id: bankAccountId,
          action: "statement_imported",
          new_status: "imported",
          notes: { file_name: file?.name, transactions: a.transactions.length, account_type: a.account_type },
        });
      }

      toast({ title: "Statement imported", description: `${extracted.accounts.length} account(s) processed.` });
      reload();
      onCommitted();
      reset();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
      setStep("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Upload Bank Statement"}
            {step === "preview" && "Review Extraction & Map Accounts"}
            {step === "saving" && "Saving…"}
            {step === "done" && "Done"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-3">
            <Label>PDF Statement</Label>
            <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-muted-foreground">
              Multi-account consolidated statements (e.g. BOCHK) will be split per account automatically.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={startExtract} disabled={!file || extracting}>
                {extracting ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</> : <><Upload className="h-4 w-4" /> Extract</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && extracted && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-sm border border-border rounded-md p-3 bg-card/40">
              <div><div className="text-muted-foreground text-xs">Bank</div><div className="font-medium">{extracted.bank_name}</div></div>
              <div><div className="text-muted-foreground text-xs">Company</div><div className="font-medium">{extracted.company_name}</div></div>
              <div><div className="text-muted-foreground text-xs">Statement Date</div><div className="font-medium">{extracted.statement_date}</div></div>
            </div>

            {extracted.accounts.map((a, i) => {
              const mapped = mappings[i];
              return (
                <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-card/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{a.account_type} <span className="text-muted-foreground text-xs">····{a.account_number_last4}</span></div>
                      <div className="text-xs text-muted-foreground">{a.account_number} · {a.currency}</div>
                    </div>
                    <div className="text-xs text-right">
                      <div>Open: <span className="td-num">{formatCurrency(a.opening_balance)}</span></div>
                      <div>Close: <span className="td-num">{formatCurrency(a.closing_balance)}</span></div>
                      <div className="text-muted-foreground">{a.transactions.length} txns</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-xs">Map to bank account</Label>
                      <Select
                        value={mapped?.bank_account_id || "__create__"}
                        onValueChange={(v) => setMappings((prev) => ({ ...prev, [i]: { ...(prev[i] || {}), bank_account_id: v } }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__create__">+ Create new bank account</SelectItem>
                          <SelectItem value="__skip__">Skip this account</SelectItem>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.account_name}{acc.account_number_last4 ? ` ····${acc.account_number_last4}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400">
                      {mapped?.bank_account_id && mapped.bank_account_id !== "__create__" && mapped.bank_account_id !== "__skip__" && (
                        <><CheckCircle2 className="h-3 w-3" /> Linked</>
                      )}
                    </div>
                  </div>

                  {mapped?.bank_account_id === "__create__" && (
                    <div>
                      <Label className="text-xs">New account name</Label>
                      <Input
                        value={mapped.new_account_name || ""}
                        onChange={(e) => setMappings((prev) => ({ ...prev, [i]: { ...prev[i], new_account_name: e.target.value } }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={commit}><ArrowRight className="h-4 w-4" /> Confirm & Import</Button>
            </DialogFooter>
          </div>
        )}

        {step === "saving" && (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving statements and transactions…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
