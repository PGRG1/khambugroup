import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { QuickFilter } from "@/components/kit/QuickFilter";
import { PhoneRow, Empty, Pager } from "@/components/finance/accounting/AccountingKit";
import { SettingsCard } from "@/components/settings/SettingsForm";
import { toast } from "sonner";

interface AuditEntry { id: string; user_display_name: string | null; action: string; entity_type: string; entity_id: string | null; details: any; created_at: string }

// Activity log, read as plain sentences: who did what and when. No record IDs, code names or raw details.
const SENTENCES: Record<string, string> = {
  "insert:sales_record": "Added a day's sales", "update:sales_record": "Changed a day's sales", "delete:sales_record": "Deleted a day's sales",
  "insert:forecast": "Added a sales target", "update:forecast": "Changed a sales target", "delete:forecast": "Deleted a sales target",
  attachment_link: "Attached a file to an invoice", attachment_repair: "Repaired an invoice file",
  finance_draft_approved: "Approved a draft entry", finance_draft_cancelled: "Cancelled a draft entry",
  source_books_updated: "Updated the books from a change", tax_notice_recorded: "Recorded a tax notice",
  bank_multi_match_confirmed: "Matched a bank payment", bank_transfer_paired: "Paired a bank transfer",
  bani_people_confirm: "Changed the rota", bani_people_undo: "Undid a rota change",
  fx_card_reprice: "Repriced a foreign card bill", record_payment: "Recorded a payment",
  finance_schedule_settings_saved: "Changed the accounting year", "tenant.provision": "Set up the business",
  supplier_directory_merge: "Merged two suppliers", undo_supplier_directory_merge: "Undid a supplier merge",
  bulk_delete: "Deleted records in bulk",
};
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function sentence(e: AuditEntry): string {
  const d = e.details ?? {};
  if (e.action === "bani_done") return d.title ?? "Bani made a change";
  if (e.action === "bani_undo") return d.title ? `Undid: ${d.title}` : "Undid a Bani change";
  if (e.action === "bulk_upload") return `Uploaded ${Number(d.count) || "some"} records`;
  const base = SENTENCES[`${e.action}:${e.entity_type}`] ?? SENTENCES[e.action];
  if (base && e.entity_type === "sales_record" && d.new?.venue && d.new?.date) return `${base.replace("a day's sales", "sales")} · ${d.new.venue}, ${shortDay(d.new.date)}`;
  if (base) return base;
  const words = e.action.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
const HK = "Asia/Hong_Kong";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: HK });
function when(iso: string) {
  const at = new Date(iso), today = new Date(), y = new Date(Date.now() - 864e5);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: HK });
  if (dayKey(at) === dayKey(today)) return `Today ${time}`;
  if (dayKey(at) === dayKey(y)) return `Yesterday ${time}`;
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(at.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}), timeZone: HK });
}
type Kind = "all" | "sales" | "money" | "people" | "bani";
const MONEY = "entity_type.in.(invoice,bill,finance,journal_entries,bank_transactions,suppliers,expense_category,expense_supplier_alias),entity_type.like.finance_*";
const PAGE = 25;

const AuditLog = () => {
  const { tenantId } = useActiveTenant();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let on = true;
    (async () => {
      if (!tenantId) { setEntries([]); setTotal(0); setLoading(false); return; }
      setLoading(true);
      let q = supabase.from("audit_log").select("*", { count: "exact" }).eq("tenant_id", tenantId);
      if (kind === "sales") q = q.in("entity_type", ["sales_record", "forecast"]);
      if (kind === "money") q = q.or(MONEY);
      if (kind === "people") q = q.in("entity_type", ["people", "tenant"]);
      if (kind === "bani") q = q.like("action", "bani_%");
      const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
      if (!on) return;
      if (error) toast.error("Activity could not be loaded");
      else { setEntries(data as AuditEntry[]); setTotal(count ?? 0); }
      setLoading(false);
    })();
    return () => { on = false; };
  }, [page, kind, tenantId]);
  const undo = async (e: AuditEntry) => {
    const { error } = await supabase.rpc("expense_bani_undo", { p_log: e.id });
    if (error) toast.error(error.message);
    else { setEntries(rows => rows.map(r => r.id === e.id ? { ...r, details: { ...r.details, undone: true } } : r)); toast.success("Bani change undone"); }
  };
  const canUndo = (e: AuditEntry) => e.action === "bani_done" && !e.details?.undone;
  const who = (e: AuditEntry) => e.user_display_name || (e.action.startsWith("bani_") ? "Bani" : "Someone");
  return <>
    <div className="px-[var(--settings-pad)] pb-2"><QuickFilter label="Show" value={kind} onChange={k => { setKind(k); setPage(1); }}
      options={[{ key: "all", label: "All" }, { key: "sales", label: "Sales" }, { key: "money", label: "Money" }, { key: "people", label: "People" }, { key: "bani", label: "Bani" }]} /></div>
    <SettingsCard>
      <ul className="min-[768px]:hidden kit">{entries.map(e => <PhoneRow key={e.id} title={sentence(e)} amount={when(e.created_at)} sub={who(e)} />)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Activity table"><table className="sales-table" aria-label="Activity">
        <thead><tr><th scope="col" className="sales-cell-left">When</th><th scope="col" className="sales-cell-left">Who</th><th scope="col" className="sales-cell-left">What changed</th><th scope="col" className="sales-cell-right"><span className="sr-only">Undo</span></th></tr></thead>
        <tbody>{entries.map(e => <tr key={e.id}>
          <td className="sales-cell-left whitespace-nowrap">{when(e.created_at)}</td>
          <td className="sales-cell-left whitespace-nowrap">{who(e)}</td>
          <td className="sales-cell-left"><span className="block truncate max-w-[440px]" title={sentence(e)}>{sentence(e)}</span></td>
          <td className="kit-num">{canUndo(e) && <button type="button" className="kit-link" onClick={() => void undo(e)}>Undo</button>}{e.details?.undone && <span className="text-muted-foreground">Undone</span>}</td>
        </tr>)}</tbody></table></div>
      {!entries.length && <Empty>{loading ? "Loading activity…" : "Nothing here yet."}</Empty>}
    </SettingsCard>
    <div className="px-[var(--settings-pad)] pb-3"><Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} onPage={setPage} /></div>
  </>;
};

export default AuditLog;
