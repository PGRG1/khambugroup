import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useBaniAsk } from "@/components/assistant/FloatingBaniContext";
import { canOpen, workLink, type WorkLink } from "@/utils/workLogLinks";
import { WorkDetail, type WorkFinding, type WorkRecord } from "./WorkDetail";
import "./work-log.css";

/** One thing the finance team did, stamped with when it did it. */
export type WorkRow = { id: string; at: string; title: string; detail: string; kind: Kind;
  /** Where the row opens; null for checks, which open in place to show what they found. */
  link: WorkLink | null;
  /** The record the row is about (read-only detail); checks carry their findings instead. */
  rec?: WorkRecord;
  findings?: WorkFinding[] };
type Kind = "Invoices" | "Bills" | "Sales" | "Bank" | "Checks" | "Month-end";
const KINDS: Kind[] = ["Invoices", "Bank", "Sales", "Bills", "Checks", "Month-end"];

const hk = (n: unknown) => `HK$${Math.round(Number(n) || 0).toLocaleString("en-HK")}`;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const monthOf = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" });
const stamp = (at: string) => {
  const d = new Date(at);
  return {
    date: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Hong_Kong" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" }),
  };
};

/** Last 7 days of work, one row per task: checks, invoices, bills, sales, bank matches, month-end entries. */
export function useWorkLog(tenantId: string | null) {
  return useQuery({
    queryKey: ["home", "work-log", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkRow[]> => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const db = supabase as any;
      const [rev, inv, sup, bills, sales, bank, je] = await Promise.all([
        db.from("finance_team_reviews").select("id,generated_at,review_type,specialists").eq("tenant_id", tenantId).eq("status", "completed").is("venue_id", null).gte("generated_at", since).limit(200),
        db.from("invoices").select("id,created_at,invoice_number,total_amount,supplier_id").eq("tenant_id", tenantId).gte("created_at", since).limit(1000),
        db.from("suppliers").select("id,name").eq("tenant_id", tenantId),
        db.from("expense_bills").select("id,created_at,vendor_name,total_amount,approval_status").eq("tenant_id", tenantId).gte("created_at", since).limit(1000),
        db.from("sales_records").select("id,created_at,date,subtotal,service_charge").eq("tenant_id", tenantId).gte("created_at", since).limit(1000),
        db.from("bank_transactions").select("id,updated_at,description,money_in,money_out").eq("tenant_id", tenantId).in("status", ["matched", "cleared", "posted"]).gte("updated_at", since).limit(1000),
        db.from("journal_entries").select("id,created_at,source_type,entry_date").eq("tenant_id", tenantId).eq("status", "posted").in("source_type", ["payroll_accrual", "depreciation"]).gte("created_at", since).limit(200),
      ]);
      const names = new Map<string, string>(((sup.data ?? []) as any[]).map((s) => [s.id, s.name]));
      const rows: WorkRow[] = [];
      for (const r of (rev.data ?? []) as any[]) {
        const found = ((r.specialists ?? []) as any[]).flatMap((s) => s.findings ?? []).filter((f: any) => f.severity === "action" || f.severity === "watch");
        const acts = found.filter((f: any) => f.severity === "action").map((f: any) => f.title);
        rows.push({ id: `r${r.id}`, at: r.generated_at, kind: "Checks", link: null,
          findings: found.map((f: any) => ({ key: String(f.key ?? f.title), title: String(f.title ?? ""), statement: String(f.statement ?? ""), action: f.severity === "action" })),
          title: `${r.review_type === "daily" ? "Daily check" : "Review"} · ${found.length ? `${found.length} ${found.length === 1 ? "thing" : "things"} to look at` : "nothing to look at"}`,
          detail: acts.slice(0, 2).join(", ") });
      }
      for (const i of (inv.data ?? []) as any[]) rows.push({ id: `i${i.id}`, at: i.created_at, kind: "Invoices", link: workLink({ kind: "invoice", id: i.id }), rec: { type: "invoice", id: i.id },
        title: `Read invoice · ${names.get(i.supplier_id) ?? "Supplier"}${i.invoice_number ? ` ${i.invoice_number}` : ""}`, detail: hk(i.total_amount) });
      for (const b of (bills.data ?? []) as any[]) rows.push({ id: `b${b.id}`, at: b.created_at, kind: "Bills", link: workLink({ kind: "bill", id: b.id }), rec: { type: "bill", id: b.id },
        title: `${b.approval_status === "approved" || b.approval_status === "posted" ? "Booked" : "Prepared"} bill · ${b.vendor_name || "Supplier"}`, detail: hk(b.total_amount) });
      for (const s of (sales.data ?? []) as any[]) rows.push({ id: `s${s.id}`, at: s.created_at, kind: "Sales", link: workLink({ kind: "sales", id: s.id }), rec: { type: "sales", id: s.id },
        title: `Booked sales · ${day(s.date)}`, detail: hk((Number(s.subtotal) || 0) + (Number(s.service_charge) || 0)) });
      for (const t of (bank.data ?? []) as any[]) rows.push({ id: `t${t.id}`, at: t.updated_at, kind: "Bank", link: workLink({ kind: "bank", id: t.id }), rec: { type: "bank", id: t.id },
        title: `Matched bank line · ${(t.description || "Bank line").slice(0, 48)}`, detail: hk(Number(t.money_in) || Number(t.money_out)) });
      for (const e of (je.data ?? []) as any[]) rows.push({ id: `j${e.id}`, at: e.created_at, kind: "Month-end", rec: { type: "journal", id: e.id }, link: workLink(e.source_type === "payroll_accrual" ? { kind: "payroll_accrual", month: e.entry_date } : { kind: "depreciation", month: e.entry_date }),
        title: `Booked ${e.source_type === "payroll_accrual" ? "payroll" : "depreciation"} · ${monthOf(e.entry_date)}`, detail: "" });
      return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    },
  });
}

/** "What we did": a log of every task, newest first, each with its own date and time. */
export function WorkLogDialog({ open, onOpenChange, rows, tenantId = null }: { open: boolean; onOpenChange: (v: boolean) => void; rows: WorkRow[]; tenantId?: string | null }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [shown, setShown] = useState(100);
  const [picked, setPicked] = useState<WorkRow | null>(null);
  const ask = useBaniAsk();
  const { isAdmin, user } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const { canAccessPage } = useUserPermissions((isPreviewActive && isAdmin ? previewUserId : user?.id) || undefined);
  const access = { isAdmin, isPreviewActive, canAccessPage };
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (!kind || r.kind === kind) && (!t || `${r.title} ${r.detail}`.toLowerCase().includes(t)));
  }, [rows, q, kind]);
  const kinds = KINDS.filter((k) => rows.some((r) => r.kind === k));
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setQ(""); setKind(null); setShown(100); setPicked(null); } }}>
      <DialogContent aria-describedby={undefined} className="wl-pop max-w-[640px] p-0 sm:p-0 gap-0 flex flex-col overflow-hidden rounded-[18px] max-h-[80svh] sm:max-h-[80svh]">
        <div className="wl-head">
          <DialogTitle className="wl-title">What we did <span>{rows.length} {rows.length === 1 ? "thing" : "things"} this week</span></DialogTitle>
          <input className="wl-search" value={q} onChange={(e) => { setQ(e.target.value); setShown(100); }} placeholder="Search what Bani did…" aria-label="Search what Bani did" />
          <div className="wl-chips" role="group" aria-label="Filter by kind">
            <button className={!kind ? "on" : ""} onClick={() => { setKind(null); setShown(100); }}>All</button>
            {kinds.map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setShown(100); }}>{k}</button>)}
          </div>
        </div>
        <div className="wl-body">
          {list.slice(0, shown).map((r) => {
            const s = stamp(r.at);
            // Every row opens its details over the list; leaving for another screen is a choice made in the panel.
            return <button key={r.id} type="button" className="wl-row" onClick={() => setPicked(r)}>
              <span className="wl-at">{s.date}<br />{s.time}</span>
              <span className="wl-what"><b>{r.title}</b>{r.detail && <em>{r.detail}</em>}</span>
              <span className="wl-kind">{r.kind}</span>
              <ChevronRight size={15} className="wl-go" />
            </button>;
          })}
          {!list.length && <p className="wl-empty">{rows.length ? "Nothing matches." : "Nothing done in the last 7 days."}</p>}
          {list.length > shown && <button className="wl-more" onClick={() => setShown((n) => n + 100)}>Show more</button>}
        </div>
        {picked && (() => { const s = stamp(picked.at); return <WorkDetail key={picked.id} tenantId={tenantId} title={picked.title} when={`${s.date} · ${s.time}`} kind={picked.kind}
          rec={picked.rec} findings={picked.findings} link={picked.link} canOpenLink={canOpen(picked.link, access)}
          onBack={() => setPicked(null)} onOpen={() => onOpenChange(false)} onAsk={(text) => { onOpenChange(false); ask(text); }} />; })()}
      </DialogContent>
    </Dialog>
  );
}
