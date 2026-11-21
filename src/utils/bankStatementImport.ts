import { supabase } from "@/integrations/supabase/client";
import { classifyTxn } from "@/utils/bankTxnRules";
import { loadReconMappingRules, matchReconRule } from "@/utils/reconciliationMappingRules";
import { formatMonthLabel } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { matchPocket, type PocketAccount } from "@/utils/statementPockets";

/**
 * The one way a bank statement pocket (one account on a statement) is saved, used by Cash › Upload and
 * by the review screen. Saving only copies the bank's record into Bani; it never touches the books.
 * Matching happens afterwards (Bani's queue picks new lines up automatically, then the account's Lines).
 *
 * Guards: the pocket must belong to exactly one known account, its lines must add up from opening to
 * closing balance, and it must not overlap a statement already saved for that account (so the same
 * month can never go in twice). A save that fails part way removes what it wrote.
 */

export type StatementLine = { txn_date: string; value_date?: string | null; raw_description: string; cleaned_counterparty?: string; reference?: string | null; deposit: number; withdrawal: number; running_balance?: number | null; source_page?: number };
export type StatementPocketData = { account_type: string; account_number: string; account_number_last4?: string; currency: string; opening_balance: number; closing_balance: number; transactions: StatementLine[] };
export type StatementData = { bank_name: string; company_name: string; statement_date: string; accounts: StatementPocketData[] };

const cents = (n: number) => Math.round(n * 100);

/** Opening balance plus money in minus money out equals the closing balance (to the cent). */
export function pocketAddsUp(p: StatementPocketData): boolean {
  const moved = p.transactions.reduce((n, t) => n + cents(Number(t.deposit || 0)) - cents(Number(t.withdrawal || 0)), 0);
  return cents(Number(p.opening_balance || 0)) + moved === cents(Number(p.closing_balance || 0));
}

/** First and last day the pocket covers (its line dates, or the statement date when it has no lines). */
export function pocketPeriod(p: StatementPocketData, statementDate: string) {
  const dates = p.transactions.map(t => t.txn_date).filter(Boolean).sort();
  return { start: dates[0] || statementDate, end: dates[dates.length - 1] || statementDate };
}

/** Saved "this bank + last 4 digits is that account" choices from earlier uploads. */
export async function savedPocketMappings(tenantId: string, statement: StatementData): Promise<Record<string, string>> {
  const last4s = statement.accounts.map(a => a.account_number_last4).filter(Boolean) as string[];
  if (!last4s.length) return {};
  const { data } = await (supabase as any).from("bank_statement_account_mappings").select("account_number_last4, bank_account_id, bank_name").eq("tenant_id", tenantId).in("account_number_last4", last4s);
  return Object.fromEntries(((data ?? []) as any[]).map(r => [`${r.bank_name}|${r.account_number_last4}`, r.bank_account_id]));
}

/** The existing account each pocket belongs to, or null when Bani isn't sure. */
export function mapPockets(statement: StatementData, accounts: PocketAccount[], base: string, saved: Record<string, string>): (string | null)[] {
  return statement.accounts.map(a => matchPocket(accounts, a, base, saved[`${statement.bank_name}|${a.account_number_last4}`]));
}

/** A statement already saved for this account that covers any of these days. */
export async function overlappingStatement(tenantId: string, bankAccountId: string, start: string, end: string): Promise<{ period_start: string; period_end: string } | null> {
  const { data, error } = await (supabase as any).from("bank_statement_imports").select("period_start, period_end")
    .eq("tenant_id", tenantId).eq("bank_account_id", bankAccountId).lte("period_start", end).gte("period_end", start).limit(1);
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

/** Save one pocket: statement row, its lines, the account mapping and an audit note. Rolls back on failure. */
export async function savePocket({ tenantId, bankAccountId, statement, pocket, storedPath, fileName, reconRules }: {
  tenantId: string; bankAccountId: string; statement: StatementData; pocket: StatementPocketData; storedPath: string | null; fileName: string | null; reconRules: any[];
}): Promise<{ lines: number }> {
  const { start, end } = pocketPeriod(pocket, statement.statement_date);
  const sb = supabase as any;
  const { data: imp, error: iErr } = await sb.from("bank_statement_imports").insert({
    bank_account_id: bankAccountId, period_start: start, period_end: end, opening_balance: pocket.opening_balance || 0, closing_balance: pocket.closing_balance || 0,
    file_url: storedPath, file_name: fileName, status: "imported", tenant_id: tenantId,
  }).select("id").single();
  if (iErr || !imp) throw new Error(`Couldn't save the statement: ${iErr?.message ?? "no row"}`);
  try {
    const rows = pocket.transactions.map(t => {
      const rec = matchReconRule(t.raw_description, t.deposit || 0, t.withdrawal || 0, reconRules);
      const cls = rec ? null : classifyTxn(t.raw_description, t.deposit || 0, t.withdrawal || 0, []);
      return {
        import_id: imp.id, bank_account_id: bankAccountId, txn_date: t.txn_date, value_date: t.value_date || null, description: t.raw_description,
        counterparty: t.cleaned_counterparty || "", reference: t.reference || "", money_in: t.deposit || 0, money_out: t.withdrawal || 0,
        running_balance: t.running_balance ?? null, source_page: t.source_page ?? null,
        suggested_type: rec?.suggested_type || cls?.suggested_type || null, suggested_category: rec?.suggested_category || cls?.suggested_category || null,
        status: "unmatched", tenant_id: tenantId, currency: pocket.currency,
      };
    });
    for (let j = 0; j < rows.length; j += 200) {
      const { error } = await sb.from("bank_transactions").insert(rows.slice(j, j + 200));
      if (error) throw new Error(`Couldn't save the lines: ${error.message}`);
    }
  } catch (e) {
    // Leave nothing half-saved.
    await sb.from("bank_transactions").delete().eq("import_id", imp.id).eq("tenant_id", tenantId);
    await sb.from("bank_statement_imports").delete().eq("id", imp.id).eq("tenant_id", tenantId);
    throw e;
  }
  if (pocket.account_number_last4) await sb.from("bank_statement_account_mappings").upsert({ bank_name: statement.bank_name, account_number_last4: pocket.account_number_last4, bank_account_id: bankAccountId }, { onConflict: "bank_name,account_number_last4" });
  await sb.from("bank_audit_trail").insert({ bank_account_id: bankAccountId, action: "statement_imported", new_status: "imported", notes: { file_name: fileName, transactions: pocket.transactions.length, account_type: pocket.account_type } });
  return { lines: pocket.transactions.length };
}

/** Stores the original file once (same bytes → same path) and returns its path. */
export async function storeStatementFile(tenantId: string, file: File, hash: string): Promise<string> {
  const path = `${tenantId}/${hash}-${file.name}`;
  const { error } = await supabase.storage.from("bank-statements").upload(path, file, { upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
  return path;
}

export async function fileHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

export async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const periodText = (start: string, end: string) => {
  const last = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return start.slice(0, 7) === end.slice(0, 7) && start.endsWith("-01") && end === last ? formatMonthLabel(end.slice(0, 7)) : `${shortDay(start)} – ${shortDay(end)}`;
};

export type StatementLoad =
  | { state: "saved"; title: string; lines: number; skipped: string[] }
  | { state: "skipped"; title: string }
  | { state: "needs"; why: "account" | "balance"; title: string; statement: StatementData; pocket: number }
  | { state: "failed"; detail: string };

/**
 * Read and load one statement file: the one path for Cash › Upload and Bani chat. Saves only when every
 * pocket maps to exactly one known account (or one the person just picked, passed in `picked`) and adds up;
 * a period already saved is skipped. Never touches the books; the caller starts Bani's matching.
 */
export async function loadStatementFile(tenantId: string, file: File, accounts: (PocketAccount & { id: string; account_name: string })[], base: string, picked: Record<number, string> = {}, read?: StatementData): Promise<StatementLoad> {
  if (file.size > 15 * 1024 * 1024) return { state: "failed", detail: "This file is over 15 MB." };
  const [hash, b64] = await Promise.all([fileHash(file), read ? Promise.resolve("") : fileBase64(file)]);
  let statement = read;
  if (!statement) {
    const { data, error } = await supabase.functions.invoke("parse-bank-statement", { body: { file_base64: b64, file_name: file.name, mime_type: file.type || "application/pdf" } });
    if (error || !data?.ok || !data.data?.accounts?.length) return { state: "failed", detail: "Couldn't read this as a bank statement. Card payout reports go in Card payouts, bills in Expenses." };
    statement = data.data as StatementData;
  }
  const saved = await savedPocketMappings(tenantId, statement);
  const owners = mapPockets(statement, accounts, base, saved).map((o, i) => o ?? (accounts.some(a => a.id === picked[i]) ? picked[i] : null));
  const unknown = statement.accounts.findIndex((_, i) => !owners[i]);
  if (unknown >= 0) return { state: "needs", why: "account", statement, pocket: unknown, title: `${statement.bank_name} ····${statement.accounts[unknown].account_number_last4 ?? ""}` };
  const off = statement.accounts.findIndex(p => !pocketAddsUp(p) || !/^[A-Z]{3}$/.test(p.currency || ""));
  if (off >= 0) return { state: "needs", why: "balance", statement, pocket: off, title: `${statement.bank_name} ····${statement.accounts[off].account_number_last4 ?? ""}` };
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
  return done.length ? { state: "saved", title: done.join(" · "), lines, skipped } : { state: "skipped", title: skipped.join(" · ") };
}

/** Start Bani's matching on new lines straight away; the background schedule keeps him going after this. */
export function startBaniMatching(tenantId: string) {
  void supabase.functions.invoke("bani-accounting", { body: { tenant_id: tenantId, mode: "run" } }).catch(() => undefined);
}
