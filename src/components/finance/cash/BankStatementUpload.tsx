import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BankAccount } from "@/hooks/useBankModule";
import { StatementUploadFlow, type ExtractedStatement } from "@/components/bank/recon/StatementUploadFlow";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { consumeBaniStatements } from "@/utils/baniStatementHandoff";
import { loadReconMappingRules } from "@/utils/reconciliationMappingRules";
import { getBaseCurrency } from "@/utils/money";
import { formatMonthLabel, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { fileBase64, fileHash, mapPockets, overlappingStatement, pocketAddsUp, pocketPeriod, savePocket, savedPocketMappings, storeStatementFile, type StatementData } from "@/utils/bankStatementImport";

type Item = { id: string; file: File; state: "reading" | "saved" | "skipped" | "needs" | "failed"; title: string; detail?: string; statement?: ExtractedStatement };

const periodText = (start: string, end: string) => {
  const last = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return start.slice(0, 7) === end.slice(0, 7) && start.endsWith("-01") && end === last ? formatMonthLabel(end.slice(0, 7)) : `${shortDay(start)} – ${shortDay(end)}`;
};

/**
 * Cash › Upload: bank statements only. Pick or drop the files and Bani loads them; matching happens later
 * in each account's Lines. Bani only stops when it isn't sure: the account isn't known, or the lines don't
 * add up to the closing balance (it may have misread). A month already uploaded for an account is skipped.
 * Card payout reports have their home in Card payouts; bills in Expenses › Bills.
 */
export function BankStatementUpload({ tenantId, accounts, onChanged, disabled, pickSignal }: { tenantId: string | null; accounts: BankAccount[]; onChanged: () => void; disabled?: boolean; pickSignal: number }) {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]), [review, setReview] = useState<Item | null>(null);
  const set = (id: string, p: Partial<Item>) => setItems(list => list.map(i => i.id === id ? { ...i, ...p } : i));
  useEffect(() => { if (pickSignal > 0 && !disabled) input.current?.click(); }, [pickSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setItems([]); setReview(null); }, [tenantId]);

  async function load(file: File) {
    if (!tenantId) return;
    const id = crypto.randomUUID();
    setItems(list => [...list, { id, file, state: "reading", title: file.name }]);
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("This file is over 15 MB.");
      const [hash, b64] = await Promise.all([fileHash(file), fileBase64(file)]);
      const { data, error } = await supabase.functions.invoke("parse-bank-statement", { body: { file_base64: b64, file_name: file.name, mime_type: file.type || "application/pdf" } });
      if (error || !data?.ok || !data.data?.accounts?.length) { set(id, { state: "failed", detail: "Couldn't read this as a bank statement. Card payout reports go in Card payouts, bills in Expenses." }); return; }
      const statement = data.data as StatementData;
      const saved = await savedPocketMappings(tenantId, statement);
      const owners = mapPockets(statement, accounts, getBaseCurrency(), saved);
      // Stop and ask only when Bani isn't sure about every account on the statement.
      const unknown = statement.accounts.find((_, i) => !owners[i]);
      if (unknown) { set(id, { state: "needs", statement: statement as ExtractedStatement, title: `${statement.bank_name} ····${unknown.account_number_last4 ?? ""}`, detail: "Which of your accounts is this?" }); return; }
      const off = statement.accounts.find(p => !pocketAddsUp(p) || !/^[A-Z]{3}$/.test(p.currency || ""));
      if (off) { set(id, { state: "needs", statement: statement as ExtractedStatement, title: `${statement.bank_name} ····${off.account_number_last4 ?? ""}`, detail: "The lines don't add up to the closing balance, so I may have misread it." }); return; }
      const path = await storeStatementFile(tenantId, file, hash);
      const rules = await loadReconMappingRules();
      const done: string[] = [], skipped: string[] = [];
      let lines = 0;
      for (let i = 0; i < statement.accounts.length; i++) {
        const pocket = statement.accounts[i], account = accounts.find(a => a.id === owners[i])!;
        const { start, end } = pocketPeriod(pocket, statement.statement_date);
        const label = `${account.account_name} · ${periodText(start, end)}`;
        if (await overlappingStatement(tenantId, account.id, start, end)) { skipped.push(label); continue; }
        lines += (await savePocket({ tenantId, bankAccountId: account.id, statement, pocket, storedPath: path, fileName: file.name, reconRules: rules })).lines;
        done.push(label);
      }
      if (done.length) { set(id, { state: "saved", title: done.join(" · "), detail: `${formatTableInteger(lines)} ${lines === 1 ? "line" : "lines"} added · Bani is matching them now${skipped.length ? ` · already had ${skipped.join(", ")}` : ""}` }); onChanged(); startBani(); }
      else set(id, { state: "skipped", title: skipped.join(" · "), detail: "Already uploaded · nothing new" });
    } catch (e) {
      set(id, { state: "failed", detail: (e as { message?: string }).message || "Couldn't save this statement." });
    }
  }
  // Start Bani on the new lines straight away; the background schedule keeps him going after this first batch.
  const startBani = () => { if (tenantId) void supabase.functions.invoke("bani-accounting", { body: { tenant_id: tenantId, mode: "run" } }).catch(() => undefined); };
  const loadAll = (files: File[]) => { if (disabled || !tenantId) return; for (const f of files) void load(f); };

  // Files dropped anywhere on the page, and statements handed over from Bani chat, load the same way.
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const drop = (e: DragEvent) => { const files = Array.from(e.dataTransfer?.files ?? []); if (!files.length) return; e.preventDefault(); loadAll(files); };
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, [disabled, tenantId, accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId || !user || disabled || !accounts.length) return;
    const files = consumeBaniStatements(`${user.id}:${tenantId}`);
    if (files.length) loadAll(files);
  }, [tenantId, user?.id, disabled, accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reading = items.filter(i => i.state === "reading").length;
  const mark = (i: Item) => i.state === "saved" ? <span className="h-5 w-5 shrink-0 rounded-full bg-[#1F6B5E] text-white text-[12px] font-bold inline-flex items-center justify-center">✓</span>
    : i.state === "reading" ? <span className="h-5 w-5 shrink-0 inline-flex items-center justify-center"><BaniProcessingMark size={18} /></span>
    : i.state === "skipped" ? <span className="h-5 w-5 shrink-0 rounded-full bg-[#9AA39E] text-white text-[12px] font-bold inline-flex items-center justify-center">–</span>
    : <span className="sales-flag shrink-0" role="img" aria-label="Needs you">!</span>;
  return <>
    <input ref={input} type="file" multiple accept=".pdf,.csv,.xlsx,.xls,image/*" className="hidden" aria-label="Bank statement files" onChange={e => { loadAll(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    {items.length > 0 && <section className="kit card-glass rounded-xl p-3 sm:p-4 min-w-0" aria-label="Statements" aria-live="polite">
      <div className="flex items-center justify-between gap-2 px-1"><h2 className="text-base font-display font-semibold whitespace-nowrap">{reading ? `Loading ${formatTableInteger(reading)} ${reading === 1 ? "statement" : "statements"}…` : "Statements"}</h2>
        {!reading && <button type="button" className="kit-link text-[13px]" onClick={() => setItems([])}>Done</button>}</div>
      <ul className="mt-2 divide-y divide-border/60">{items.map(i => <li key={i.id} className={`flex items-center gap-2.5 px-1 py-2.5 ${i.state === "needs" || i.state === "failed" ? "bg-[#FDF3F2]" : ""}`}>
        {mark(i)}
        <span className="block flex-1 min-w-0"><span className="block truncate text-[14px]">{i.title}</span>{i.detail && <span className={`mt-0.5 block truncate text-[12px] ${i.state === "needs" || i.state === "failed" ? "text-[#B45309]" : "text-muted-foreground"}`}>{i.detail}</span>}{i.state === "reading" && <span className="mt-0.5 block text-[12px] text-muted-foreground">Reading…</span>}</span>
        {i.state === "needs" && <button type="button" className="kit-link text-[13px] shrink-0" disabled={disabled} onClick={() => setReview(i)}>Check</button>}
        {i.state === "failed" && <button type="button" className="kit-link text-[13px] shrink-0" onClick={() => setItems(list => list.filter(x => x.id !== i.id))}>Remove</button>}
      </li>)}</ul>
    </section>}
    {review?.statement && <StatementUploadFlow key={review.id} open onClose={() => setReview(null)} onCommitted={() => { set(review.id, { state: "saved", detail: "Saved after your check · Bani is matching the lines now" }); setReview(null); onChanged(); startBani(); }}
      accounts={accounts} reload={onChanged} tenantId={tenantId} initial={{ file: review.file, extracted: review.statement }} />}
  </>;
}
