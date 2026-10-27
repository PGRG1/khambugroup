import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, AudioLines, Check, Copy, Loader2, Mic, RefreshCw, X } from "lucide-react";
import { ruleCovers, type VenueClosureRule } from "@/utils/venueClosures";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PixelAvatar } from "@/components/team/PixelAvatar";
import "@/components/team/team.css";
import {
  fmtHKD, fmtDate, type Finding, type Figure, type SpecialistReport, type Synthesis,
} from "../../supabase/functions/_shared/financeTeamReview";

// ---------------- roles ----------------
type Role = "revenue" | "procurement" | "accountant" | "people" | "controller";
const ROLES: { key: Role; title: string; sub: string; seed: number; pal: number }[] = [
  { key: "revenue", title: "Revenue Manager", sub: "Looks after your sales", seed: 11, pal: 1 },
  { key: "procurement", title: "Procurement Manager", sub: "Looks after suppliers and stock", seed: 27, pal: 2 },
  { key: "accountant", title: "Accountant", sub: "Looks after bills to pay and the books", seed: 77, pal: 5 },
  { key: "people", title: "People Manager", sub: "Looks after rosters, leave and pay", seed: 41, pal: 3 },
  { key: "controller", title: "Financial Controller", sub: "Looks after cash, running costs and month-end", seed: 58, pal: 4 },
];
const FD = { seed: 3, pal: 0 };
const roleMeta = (r: Role) => ROLES.find((x) => x.key === r)!;

/** Old saved reviews used role "accounting"; map their finding keys onto the new roles. */
function roleOfFinding(key: string): Role {
  if (key === "accounting.overdue_payables" || key === "accounting.bills_pending") return "accountant";
  if (key === "accounting.bank") return "controller";
  const p = key.split(".")[0];
  return (["revenue", "procurement", "accountant", "people", "controller"].includes(p) ? p : "controller") as Role;
}

interface Review {
  id: string; venue_id: string | null; venue_label: string; review_type: string;
  period_start: string; period_end: string; status: string; generated_at: string | null;
  specialists: SpecialistReport[]; synthesis: Synthesis;
}

interface RoleView {
  role: Role;
  summary: string;
  headline: { value: Figure; note: string } | null;
  workDone: { label: string; count: number }[];
  findings: Finding[];
}

/** Normalize any saved review (old or new shape) into per-role views. */
function roleViews(review: Review): RoleView[] {
  return ROLES.map(({ key }) => {
    const mine: Finding[] = [];
    let summary = "";
    let headline: RoleView["headline"] = null;
    let workDone: { label: string; count: number }[] = [];
    for (const sp of review.specialists ?? []) {
      const sps = (sp.findings ?? []).filter((f) => roleOfFinding(f.key) === key);
      if ((sp.role as string) === key) {
        summary = sp.summary || summary;
        headline = sp.headline ?? headline;
        workDone = sp.work_done ?? [];
      }
      mine.push(...sps);
    }
    if (!summary && mine.length) summary = mine[0].statement;
    // Fallback headlines for old reviews that predate the headline field.
    if (!headline) {
      const pick = (k: string, note: string) => {
        const f = mine.find((x) => x.key === k);
        const v = f?.figures?.[0];
        return f?.assessable && v ? { value: v, note } : null;
      };
      if (key === "revenue") headline = pick("revenue.sales", "latest period");
      if (key === "accountant") headline = pick("accounting.overdue_payables", "overdue");
      if (key === "controller") {
        const bank = mine.find((x) => x.key === "accounting.bank" || x.key === "controller.bank");
        const bal = bank?.figures?.find((x) => x.unit === "HKD" && /balance/i.test(x.label));
        if (bal) headline = { value: bal, note: "last statement balance" };
      }
    }
    return { role: key, summary, headline, workDone, findings: mine };
  });
}

// ---------------- quick replies ----------------
type ChipAction =
  | { kind: "closed"; venueIds?: string[]; names?: string[] }
  | { kind: "traded-missing" }
  | { kind: "action"; verb: string; reply: string; quote?: string };

const CHIPS: Record<string, { label: string; action: ChipAction }[]> = {
  "revenue.missing_venues": [
    { label: "They were closed", action: { kind: "closed" } },
    { label: "They traded, data is missing", action: { kind: "traded-missing" } },
  ],
  "revenue.payment_mismatch": [
    { label: "Look into it", action: { kind: "action", verb: "look into the unbalanced sales records", reply: "Noted — I'm watching those records. The payment breakdown needs correcting on the sales records page; I'll flag it again tomorrow if it's still out." } },
  ],
  "procurement.price_rises": [
    { label: "Accept the new price", action: { kind: "action", verb: "accept the new supplier prices", reply: "Noted. I'll check future invoices against these new prices and tell you if they move again." } },
    { label: "Get a query to send", action: { kind: "action", verb: "draft a price query", reply: "Here's a message you can send to the supplier:", quote: "Hi — on your latest invoice the unit price is higher than before. Could you confirm whether this is a permanent price change or an error on the invoice? Thanks." } },
  ],
  "procurement.disputes": [
    { label: "Get a query to send", action: { kind: "action", verb: "draft a dispute follow-up", reply: "Here's a message you can send to the supplier:", quote: "Hi — we're holding payment on the disputed invoice(s) for now. Could you confirm the credit note or corrected invoice so we can settle the rest? Thanks." } },
    { label: "Look into it", action: { kind: "action", verb: "look into the disputed invoices", reply: "Noted — I'm watching the disputed invoices. They stay on hold until you resolve them with the supplier." } },
  ],
  "accountant.overdue_payables": [
    { label: "Get them ready to pay", action: { kind: "action", verb: "get the overdue payables ready to pay", reply: "Done — the overdue list is marked as ready for you to pay through the bank. I never pay anything myself." } },
    { label: "Hold one", action: { kind: "action", verb: "hold an overdue payable", reply: "Noted. Open Accounts Payable, pick the invoice and set it to disputed or on hold — I'll stop counting it as due." } },
  ],
  "accountant.bills_pending": [
    { label: "Approve", action: { kind: "action", verb: "approve the waiting bills", reply: "Noted. The actual approval happens on the Approvals page — I've marked it for you so it's first on the list." } },
    { label: "Look into it", action: { kind: "action", verb: "look into the pending bills", reply: "Noted — I'm watching the bills waiting for approval." } },
  ],
  "accountant.due_this_week": [
    { label: "Get them ready to pay", action: { kind: "action", verb: "get this week's payments ready", reply: "Done — this week's due list is marked as ready for you to pay through the bank before the due dates." } },
  ],
  "people.leave_pending": [
    { label: "Look into it", action: { kind: "action", verb: "review the waiting leave requests", reply: "Noted. The approve/decline buttons are on the Leave page — I've marked it so you see it first." } },
  ],
  "people.roster_missing": [
    { label: "Look into it", action: { kind: "action", verb: "chase the missing roster", reply: "Noted — I'm watching it. Build next week's roster on the Roster page and I'll confirm it tomorrow." } },
  ],
  "people.overtime": [
    { label: "Look into it", action: { kind: "action", verb: "look into the extra hours", reply: "Noted — I'm watching the extra hours and will flag it again if it continues." } },
  ],
  "controller.bank": [
    { label: "Look into it", action: { kind: "action", verb: "look into the bank matching", reply: "Noted — I'm watching it. Import the latest statement or match the waiting lines and I'll confirm once it clears." } },
  ],
  "controller.running_costs": [
    { label: "Look into it", action: { kind: "action", verb: "look into the running costs", reply: "Noted — I'm watching those cost categories and will flag them again if they keep climbing." } },
  ],
  "controller.settlements": [
    { label: "Look into it", action: { kind: "action", verb: "look into the missing settlements", reply: "Noted — I'm watching the settlements that haven't landed in the bank yet." } },
  ],
};

// ---------------- thread model ----------------
interface ThreadMsg {
  id: string;
  from: "role" | "user";
  text: string;
  table?: Figure[];
  quote?: string;
  chips?: { label: string; action: ChipAction }[];
  confirm?: { label: string; action: ChipAction; finding: Finding };
  done?: boolean; // chips/confirm already handled
}
const joinNames = (n?: string[]) => (!n || !n.length ? "that venue" : n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m-${Date.now()}-${Math.random()}`);
/** "sales records imported" → "sales record imported" when count is 1. */
const workLabel = (label: string, count: number) => (count === 1 ? label.replace(/s (\w+)$/, " $1") : label);

const KEYWORDS: [RegExp, Role][] = [
  [/sales|closed|guest|revenue|cover|trade|traded/i, "revenue"],
  [/price|supplier|stock|invoice/i, "procurement"],
  [/bill|pay supplier|due|owe|payable/i, "accountant"],
  [/roster|leave|staff|payroll|overtime|shift/i, "people"],
  [/cash|bank|rent|electric|running cost|settlement/i, "controller"],
];

// ---------------- page ----------------
export default function YourTeam() {
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const vs = useVenueScope();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Reviews exist for all venues or for one venue; a mix of 2+ venues has no review.
  const scopeIds = vs.filterIds;
  const mixedScope = !!scopeIds && scopeIds.length > 1;
  const venueId: string | null = scopeIds && scopeIds.length === 1 ? scopeIds[0] : null;
  const [openRole, setOpenRole] = useState<Role | null>(null);
  const [threads, setThreads] = useState<Partial<Record<Role, ThreadMsg[]>>>({});
  const [raised, setRaised] = useState<Partial<Record<Role, string[]>>>({});
  const [fdLine, setFdLine] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [running, setRunning] = useState(false);

  const tenantName = useQuery({
    queryKey: ["yourteam", "tenantName", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenants").select("name").eq("id", tenantId).maybeSingle();
      return (data?.name as string) ?? "";
    },
  });

  const reviewQ = useQuery({
    queryKey: ["yourteam", "review", tenantId, venueId],
    enabled: !!tenantId && vs.ready && !mixedScope,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Review | null> => {
      let q = (supabase as any).from("finance_team_reviews")
        .select("id,venue_id,venue_label,review_type,period_start,period_end,status,generated_at,specialists,synthesis")
        .eq("tenant_id", tenantId).eq("status", "completed")
        .order("generated_at", { ascending: false }).limit(1);
      q = venueId ? q.eq("venue_id", venueId) : q.is("venue_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data?.[0] ?? null) as Review | null;
    },
  });
  const review = reviewQ.data ?? null;
  const views = useMemo(() => (review ? roleViews(review) : []), [review]);

  // Venue-days already marked closed for the review's day, so answered items don't come back.
  const closedQ = useQuery({
    queryKey: ["yourteam", "closed", tenantId, review?.period_end],
    enabled: !!tenantId && !!review,
    queryFn: async () => {
      const day = review!.period_end;
      const [old, cl, rules] = await Promise.all([
        (supabase as any).from("venue_closed_days").select("venue_id").eq("tenant_id", tenantId).eq("date", day),
        supabase.from("venue_closures").select("venue_id").eq("tenant_id", tenantId).eq("date", day),
        supabase.from("venue_closure_rules").select("*").eq("tenant_id", tenantId).lte("start_date", day),
      ]);
      const ids = [...(old.data ?? []), ...(cl.data ?? []), ...((rules.data ?? []) as VenueClosureRule[]).filter((r) => ruleCovers(r, day))].map((c: any) => c.venue_id as string);
      return new Set<string>(ids);
    },
  });
  /** Venues the missing-sales finding names that are not yet marked closed. */
  const missingVenuesOf = useCallback((f: Finding) => {
    if (f.key !== "revenue.missing_venues") return [];
    const closed = closedQ.data ?? new Set<string>();
    return vs.venues.filter((v) => f.statement.includes(v.name) && !closed.has(v.id));
  }, [vs.venues, closedQ.data]);
  const isResolved = useCallback((f: Finding) => f.key === "revenue.missing_venues" && !!closedQ.data && missingVenuesOf(f).length === 0, [missingVenuesOf, closedQ.data]);
  const chipsFor = useCallback((f: Finding) => {
    if (f.key !== "revenue.missing_venues") return CHIPS[f.key] ?? [];
    const mv = missingVenuesOf(f);
    const traded = { label: mv.length > 1 ? "They traded, data is missing" : "It traded, data is missing", action: { kind: "traded-missing" } as ChipAction };
    if (mv.length <= 1) return [{ label: mv.length ? `${mv[0].name} was closed` : "They were closed", action: { kind: "closed", venueIds: mv.map((v) => v.id), names: mv.map((v) => v.name) } as ChipAction }, traded];
    return [
      { label: "All were closed", action: { kind: "closed", venueIds: mv.map((v) => v.id), names: mv.map((v) => v.name) } as ChipAction },
      ...mv.map((v) => ({ label: `Only ${v.name} was closed`, action: { kind: "closed", venueIds: [v.id], names: [v.name] } as ChipAction })),
      traded,
    ];
  }, [missingVenuesOf]);

  // Finance Director tiles (client-side, only shown when calculable).
  const tiles = useQuery({
    queryKey: ["yourteam", "tiles", tenantId, venueId],
    enabled: !!tenantId && vs.ready && !mixedScope,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const scoped = (q: any) => (venueId ? q.eq("venue_id", venueId) : q);
      const [salesRes, invRes, tgtRes] = await Promise.all([
        scoped((supabase as any).from("sales_records").select("subtotal,service_charge").eq("tenant_id", tenantId).gte("date", monthStart)),
        scoped((supabase as any).from("invoices").select("total_amount").eq("tenant_id", tenantId).gte("invoice_date", monthStart).is("voided_at", null)),
        (supabase as any).from("revenue_targets").select("target_amount").eq("tenant_id", tenantId).eq("year", now.getFullYear()).eq("month", now.getMonth() + 1),
      ]);
      const salesMtd = (salesRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.subtotal) || 0) + (Number(r.service_charge) || 0), 0);
      const spendMtd = (invRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
      const target = (tgtRes.data ?? []).reduce((s: number, r: any) => s + (Number(r.target_amount) || 0), 0);
      return { salesMtd, spendMtd, target: target > 0 ? target : null };
    },
  });

  const yesterdayStr = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const stale = !review || !review.generated_at || review.generated_at.slice(0, 10) < yesterdayStr;

  const runUpdate = async () => {
    if (!tenantId || running || mixedScope) return;
    setRunning(true);
    let error: any = null;
    try {
      ({ error } = await supabase.functions.invoke("finance-team", { body: { mode: "run", tenant_id: tenantId, venue_id: venueId, review_type: "daily" } }));
    } catch (e) { error = e; }
    // 409 = a review for this scope is already being prepared (morning job,
    // another tab). That's not a failure: wait for it and pick up the result.
    const status = (error as any)?.context?.status;
    if (error && status === 409) {
      setFdLine("Your team is already preparing today's update — it'll appear here shortly.");
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        await qc.invalidateQueries({ queryKey: ["yourteam", "review"] });
      }
      setRunning(false);
      return;
    }
    setRunning(false);
    if (error) setFdLine("I couldn't prepare today's update just now — try again in a moment.");
    else qc.invalidateQueries({ queryKey: ["yourteam", "review"] });
  };

  // The team prepares today's update on its own: when the latest review is
  // stale or missing, run it once per scope per day without waiting for a click.
  // On failure the button stays as the manual retry.
  const autoRanFor = useRef<string | null>(null);
  useEffect(() => {
    if (!tenantId || mixedScope || reviewQ.isLoading || !stale || running) return;
    const key = `${tenantId}:${venueId ?? "all"}:${yesterdayStr}`;
    if (autoRanFor.current === key) return;
    autoRanFor.current = key;
    void runUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, mixedScope, reviewQ.isLoading, stale, running, venueId, yesterdayStr]);

  // ---- desk thread helpers ----
  const pushMsg = useCallback((role: Role, msg: ThreadMsg) => {
    setThreads((t) => ({ ...t, [role]: [...(t[role] ?? []), msg] }));
  }, []);

  const openItems = useCallback((v: RoleView) =>
    v.findings
      .filter((f) => f.recommendation && (f.severity === "action" || f.severity === "watch") && !isResolved(f))
      .sort((a, b) => (a.severity === "action" ? 0 : 1) - (b.severity === "action" ? 0 : 1))
      .slice(0, 2), [isResolved]);

  const raiseItem = useCallback((v: RoleView, finding: Finding) => {
    const chips = chipsFor(finding);
    pushMsg(v.role, {
      id: newId(), from: "role",
      text: finding.assessable ? finding.statement : finding.statement,
      chips: [{ label: "Show me", action: { kind: "action", verb: "", reply: "" } }, ...chips],
    });
    setRaised((r) => ({ ...r, [v.role]: [...(r[v.role] ?? []), finding.key] }));
  }, [pushMsg, chipsFor]);

  const openDesk = useCallback((role: Role, seedMessage?: string) => {
    setOpenRole(role);
    const v = views.find((x) => x.role === role);
    if (!v) return;
    setThreads((t) => {
      if (t[role]?.length) return t;
      const items = openItems(v);
      const first = items[0];
      const msgs: ThreadMsg[] = [];
      if (first) {
        msgs.push({
          id: newId(), from: "role", text: first.statement,
          chips: [{ label: "Show me", action: { kind: "action", verb: "", reply: "" } }, ...chipsFor(first)],
        });
      } else {
        msgs.push({ id: newId(), from: "role", text: v.summary || "Nothing needs you from me today. Ask me anything about my area." });
      }
      return { ...t, [role]: msgs };
    });
    if (views.find((x) => x.role === role)) {
      const items = openItems(v);
      if (items[0]) setRaised((r) => ({ ...r, [role]: [items[0].key] }));
    }
    if (seedMessage) {
      pushMsg(role, { id: newId(), from: "user", text: seedMessage });
      void askRole(role, seedMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, openItems, pushMsg, chipsFor]);

  const askRole = async (role: Role | null, question: string) => {
    if (!tenantId || !review) return;
    setAsking(true);
    const { data, error } = await supabase.functions.invoke("finance-team", {
      body: { mode: "ask", tenant_id: tenantId, review_id: review.id, question, ...(role ? { role } : {}) },
    });
    setAsking(false);
    let text = "I couldn't answer that just now — try again in a moment.";
    if (!error) {
      if ((data as any)?.error) text = (data as any).error;
      else if ((data as any)?.answer) text = (data as any).answer;
    }
    if (role) pushMsg(role, { id: newId(), from: "role", text });
    else setFdLine(text);
  };

  const recordAction = async (role: Role, finding: Finding, note: string) => {
    if (!tenantId || !user || !review) return;
    const due = new Date(); due.setDate(due.getDate() + 3);
    const { data, error } = await (supabase as any).from("finance_team_actions").insert({
      tenant_id: tenantId, venue_id: review.venue_id, review_id: review.id,
      finding_key: finding.key, specialist: role, title: finding.title,
      recommendation: note, evidence: finding.evidence ?? [],
      assignee_id: user.id, due_date: due.toISOString().slice(0, 10), accepted_by: user.id,
    }).select("id").single();
    if (!error && data?.id) {
      await (supabase as any).from("finance_team_action_events").insert({
        action_id: data.id, tenant_id: tenantId, venue_id: review.venue_id,
        event: "your_team_chip", actor_id: user.id, details: { note },
      });
    }
  };

  const handleChip = (role: Role, msg: ThreadMsg, chip: { label: string; action: ChipAction }, finding?: Finding) => {
    const v = views.find((x) => x.role === role);
    const f = finding ?? v?.findings.find((x) => x.key === raised[role]?.[raised[role]!.length - 1]);
    // "Show me" → inline figures table, no confirm.
    if (chip.label === "Show me" && f) {
      pushMsg(role, { id: newId(), from: "user", text: "Show me" });
      pushMsg(role, { id: newId(), from: "role", text: f.title, table: f.figures });
      markDone(role, msg.id);
      return;
    }
    if (!f) return;
    markDone(role, msg.id);
    pushMsg(role, { id: newId(), from: "user", text: chip.label });
    pushMsg(role, {
      id: newId(), from: "role",
      text: chip.action.kind === "closed"
        ? `I'll mark ${joinNames(chip.action.names)} as closed on ${review ? fmtDate(review.period_end) : "that day"}, so ${chip.action.names && chip.action.names.length > 1 ? "they stop" : "it stops"} showing as missing sales. OK?`
        : chip.action.kind === "traded-missing"
          ? "I'll keep it flagged until the sales record arrives. OK?"
          : `I'll ${chip.action.verb}. OK?`,
      confirm: { label: chip.label, action: chip.action, finding: f },
    });
  };

  const markDone = (role: Role, id: string) => {
    setThreads((t) => ({ ...t, [role]: (t[role] ?? []).map((m) => (m.id === id ? { ...m, done: true } : m)) }));
  };

  const handleConfirm = async (role: Role, msg: ThreadMsg, ok: boolean) => {
    markDone(role, msg.id);
    if (!ok || !msg.confirm) {
      pushMsg(role, { id: newId(), from: "role", text: "No problem — I've left it as it is." });
      return;
    }
    const { action, finding } = msg.confirm;
    if (action.kind === "closed") {
      const ids = action.venueIds?.length ? action.venueIds : missingVenuesOf(finding).map((v) => v.id);
      const names = action.names?.length ? action.names : vs.venues.filter((v) => ids.includes(v.id)).map((v) => v.name);
      if (!review || !tenantId || !user || !ids.length) {
        pushMsg(role, { id: newId(), from: "role", text: "I couldn't tell which venue you mean — tap the venue's button above." });
        return;
      }
      const { error } = await (supabase as any).from("venue_closed_days").upsert(
        ids.map((venue_id) => ({ tenant_id: tenantId, venue_id, date: review.period_end, reason: "Marked closed from Your team", created_by: user.id })),
        { onConflict: "venue_id,date", ignoreDuplicates: true },
      );
      await supabase.from("venue_closures").upsert(
        ids.map((venue_id) => ({ tenant_id: tenantId, venue_id, date: review.period_end, reason: "Closed", note: "Marked closed from Your team", source: "your_team", created_by: user.id })),
        { onConflict: "venue_id,date", ignoreDuplicates: true },
      );
      if (error) {
        pushMsg(role, { id: newId(), from: "role", text: "I couldn't save that just now — try again in a moment." });
        return;
      }
      await recordAction(role, finding, `User confirmed ${names.join(", ")} closed on ${review.period_end}.`);
      // Records for that day (e.g. a partial day) also get a "Closed early" note.
      const { data: recs } = await supabase.from("sales_records").select("id,venue_id").eq("tenant_id", tenantId).eq("date", review.period_end).in("venue_id", ids);
      if (recs?.length) {
        await supabase.from("sales_record_notes").insert(
          recs.map((r) => ({ tenant_id: tenantId, sales_record_id: r.id, body: "Marked closed from Your team", tag: "Closed early" })) as any,
        );
      }
      await qc.invalidateQueries({ queryKey: ["yourteam", "closed"] });
      qc.invalidateQueries({ queryKey: ["venue-closures"] });
      const left = missingVenuesOf(finding).filter((v) => !ids.includes(v.id)).map((v) => v.name);
      pushMsg(role, { id: newId(), from: "role", text: `Done — ${joinNames(names)} ${names.length > 1 ? "are" : "is"} marked closed on ${fmtDate(review.period_end)} and won't show as missing sales.` + (left.length ? ` ${joinNames(left)} still has no sales — scan or upload the Z-report if it traded.` : "") });
      if (left.length) return;
    } else if (action.kind === "traded-missing") {
      await recordAction(role, finding, "User confirmed the venue traded — sales data is missing.");
      pushMsg(role, { id: newId(), from: "role", text: "Got it — they traded, so the data is missing. Scan or upload the Z-report and I'll pick it up tomorrow." });
    } else {
      await recordAction(role, finding, action.verb);
      pushMsg(role, { id: newId(), from: "role", text: action.reply, quote: action.quote });
    }
    // Raise the next open item, one at a time.
    const v = views.find((x) => x.role === role);
    if (v) {
      const next = openItems(v).find((f) => !(raised[role] ?? []).includes(f.key) && f.key !== finding.key);
      if (next) raiseItem(v, next);
    }
  };

  // ---- composer ----
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || asking) return;
    setInput("");
    // Exception: venue-closed message with an open missing-venues item.
    const rev = views.find((x) => x.role === "revenue");
    const missing = rev?.findings.find((f) => f.key === "revenue.missing_venues" && f.recommendation && f.severity !== "info");
    // A plain statement like "Arca was closed" (not a question) offers to mark it; questions go to the team.
    const isQuestion = /\?\s*$/.test(text) || /^(can|could|are|is|do|does|will|would|why|how|what|when|where|which|who)\b/i.test(text);
    const mv = missing && !isResolved(missing) ? missingVenuesOf(missing) : [];
    if (mv.length && !isQuestion && /\bclosed\b/i.test(text)) {
      const named = mv.filter((v) => text.toLowerCase().includes(v.name.toLowerCase()));
      const target = named.length ? named : mv;
      if (openRole !== "revenue") openDesk("revenue");
      pushMsg("revenue", { id: newId(), from: "user", text });
      pushMsg("revenue", {
        id: newId(), from: "role",
        text: `I'll mark ${joinNames(target.map((v) => v.name))} as closed on ${review ? fmtDate(review.period_end) : "that day"}. OK?`,
        confirm: { label: "Closed", action: { kind: "closed", venueIds: target.map((v) => v.id), names: target.map((v) => v.name) }, finding: missing! },
      });
      return;
    }
    if (openRole) {
      pushMsg(openRole, { id: newId(), from: "user", text });
      await askRole(openRole, text);
      return;
    }
    const hit = KEYWORDS.find(([re]) => re.test(text));
    if (hit) {
      const role = hit[1];
      setFdLine(`I've passed that to your ${roleMeta(role).title}.`);
      openDesk(role, text);
    } else {
      setFdLine("…");
      await askRole(null, text);
    }
  };

  // A different venue scope means a different review: start fresh desks.
  useEffect(() => { setOpenRole(null); setThreads({}); setRaised({}); setFdLine(null); }, [venueId, mixedScope]);

  // Esc closes the open desk.
  useEffect(() => {
    if (!openRole) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenRole(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRole]);

  const workDoneTotal = views.reduce((s, v) => s + v.workDone.reduce((a, w) => a + w.count, 0), 0);
  const controllerView = views.find((x) => x.role === "controller");
  const hasText = !!input.trim();
  const openView = openRole ? views.find((x) => x.role === openRole) : null;
  const openMeta = openRole ? roleMeta(openRole) : null;

  return (
    <div className="w-full mx-auto max-w-[1100px] pb-40" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Top row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] text-muted-foreground">
          <span className="td-num" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmtDate(new Date().toISOString().slice(0, 10))}</span>
          {tenantName.data ? <span> · {tenantName.data}</span> : null}
        </div>
      </div>

      {/* Finance Director band */}
      <div className="mt-4 rounded-2xl p-5 text-[#F2F7F4]" style={{ background: "#1F3F3B" }}>
        {mixedScope ? (
          <div className="flex items-start gap-4">
            <PixelAvatar seed={FD.seed} palette={FD.pal} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Finance Director</p>
              <p className="text-[18px] leading-snug mt-1">Your team prepares updates for one venue or all venues. Pick one venue, or all venues, to see their work.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!vs.restricted && (
                  <button onClick={vs.reset} className="inline-flex items-center h-10 px-4 rounded-full text-[13px] font-medium bg-white/15 hover:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                    All venues
                  </button>
                )}
                <Select onValueChange={(id) => vs.setScope([id])}>
                  <SelectTrigger aria-label="Pick one venue" className="h-10 w-[200px] rounded-full bg-card text-[13px] text-foreground">
                    <SelectValue placeholder="Pick one venue" />
                  </SelectTrigger>
                  <SelectContent>
                    {vs.venues.filter((v) => !!v.id).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : reviewQ.isLoading ? (
          <div className="space-y-2"><Skeleton className="h-6 w-2/3 bg-white/10" /><Skeleton className="h-4 w-1/3 bg-white/10" /></div>
        ) : !review ? (
          <div className="flex items-start gap-4">
            <PixelAvatar seed={FD.seed} palette={FD.pal} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Finance Director</p>
              <p className="text-[21px] leading-snug mt-1">{running ? "Your team is looking at the books now…" : "Your team hasn't looked at the books yet."}</p>
              {!running && (
                <button onClick={runUpdate} disabled={running}
                  className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-medium bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-50">
                  <RefreshCw className="h-4 w-4" />
                  Get today's update
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <PixelAvatar seed={FD.seed} palette={FD.pal} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Finance Director</p>
                  <p className="text-[12px] text-white/50">Keeps an eye on the whole business</p>
                </div>
                {stale && (
                  running ? (
                    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium bg-white/15 shrink-0">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Preparing today's update…
                    </span>
                  ) : (
                    <button onClick={runUpdate} disabled={running}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-50 shrink-0">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Get today's update
                    </button>
                  )
                )}
              </div>
              <p className="text-[21px] leading-snug mt-2">{review.synthesis?.headline}</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {tiles.data && tiles.data.salesMtd > 0 && (
                  <Tile label="Sales this month" value={fmtHKD(tiles.data.salesMtd)}
                    note={tiles.data.target ? `${Math.round((tiles.data.salesMtd / tiles.data.target) * 100)}% of target` : undefined} />
                )}
                {tiles.data && tiles.data.salesMtd > 0 && tiles.data.spendMtd > 0 && (
                  <Tile label="Spent with food & drink suppliers"
                    value={`HK$${Math.round((tiles.data.spendMtd / tiles.data.salesMtd) * 100)} of every HK$100`}
                    note="based on invoices, not stock counts" />
                )}
                {controllerView?.headline && (
                  <Tile label="Bank balance" value={controllerView.headline.value.display} note={controllerView.headline.note} />
                )}
                {workDoneTotal > 0 && (
                  <Tile label="Work done since yesterday" value={String(workDoneTotal)} note="records handled by the team" />
                )}
              </div>
              {fdLine && <p className="mt-3 text-[13px] text-white/80 italic">{fdLine}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Team grid / open desk */}
      {mixedScope ? null : reviewQ.isLoading ? (
        <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[150px] rounded-xl" />)}
        </div>
      ) : !review ? null : !openView || !openMeta ? (
        <>
          <h2 className="mt-6 mb-3 text-[13px] font-medium text-muted-foreground">Your team · open anyone to see their work and direct them</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {views.map((v) => {
              const meta = roleMeta(v.role);
              const openCount = openItems(v).length;
              return (
                <button key={v.role} onClick={() => openDesk(v.role)}
                  className="yt-glass rounded-xl p-4 text-left hover:brightness-[1.02] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[40px]">
                  <div className="flex items-center gap-3">
                    <PixelAvatar seed={meta.seed} palette={meta.pal} size={44} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold truncate">{meta.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{meta.sub}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[24px] leading-tight" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {v.headline ? v.headline.value.display : "—"}
                  </p>
                  {v.headline && <p className="text-[11px] text-muted-foreground mt-0.5">{v.headline.note}</p>}
                  {v.workDone[0] && <p className="mt-2 text-[12px] text-foreground/80">✓ {v.workDone[0].count} {workLabel(v.workDone[0].label, v.workDone[0].count)}</p>}
                  <div className="mt-3">
                    {openCount > 0
                      ? <span className="chip chip-warn">{openCount} thing{openCount === 1 ? "" : "s"} for you</span>
                      : <span className="chip chip-success">All clear</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <Desk
          view={openView} meta={openMeta}
          thread={threads[openView.role] ?? []}
          asking={asking}
          onClose={() => setOpenRole(null)}
          onChip={(msg, chip) => handleChip(openView.role, msg, chip)}
          onConfirm={(msg, ok) => void handleConfirm(openView.role, msg, ok)}
        />
      )}

      {/* Message bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto w-full max-w-[640px] px-4 pointer-events-auto">
          <div className="yt-glass yt-composer flex min-h-[54px] items-end gap-1 rounded-[24px] py-2 pr-2 pl-3">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendMessage(); } }}
              placeholder={openView && openMeta ? `Tell your ${openMeta.title} what to do…` : "Ask your finance team…"}
              aria-label="Message your finance team"
              rows={1}
              className="yt-input min-h-[36px] flex-1 resize-none self-center py-[7px] text-[15px] leading-[22px]"
            />
            <button type="button" onClick={() => navigate("/assistant?voice=1")} aria-label="Talk to Bani"
              className="yt-mic relative mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ color: "#5B706B" }}>
              <Mic className="h-4 w-4" />
            </button>
            <button type="button"
              onClick={hasText ? () => void sendMessage() : () => navigate("/assistant?voice=1")}
              disabled={hasText && asking}
              aria-label={hasText ? "Send message" : "Start voice conversation"}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-45"
              style={{ background: "#1F3A37" }}>
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : hasText ? <ArrowUp className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">Bani can make mistakes. Verify before acting.</p>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-white/10 p-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-white/55 truncate">{label}</p>
      <p className="text-[15px] font-medium mt-0.5 truncate" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{value}</p>
      {note && <p className="text-[10px] text-white/50 mt-0.5 truncate">{note}</p>}
    </div>
  );
}

// ---------------- desk ----------------
function Desk({ view, meta, thread, asking, onClose, onChip, onConfirm }: {
  view: RoleView; meta: { title: string; sub: string; seed: number; pal: number };
  thread: ThreadMsg[]; asking: boolean;
  onClose: () => void;
  onChip: (msg: ThreadMsg, chip: { label: string; action: ChipAction }) => void;
  onConfirm: (msg: ThreadMsg, ok: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, asking]);

  const metricFindings = view.findings.filter((f) => f.assessable && f.figures.length).slice(0, 3);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <PixelAvatar seed={meta.seed} palette={meta.pal} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{meta.title}</p>
          <p className="text-[12px] text-muted-foreground">{meta.sub}</p>
        </div>
        <button onClick={onClose} aria-label="Close"
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full text-[13px] font-medium border border-border/60 hover:bg-muted transition-colors">
          <X className="h-4 w-4" /> Close
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Left: how it's going + work done */}
        <div className="space-y-4 min-w-0">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">How it's going</p>
            <div className="space-y-2">
              {metricFindings.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing I can measure yet.</p>}
              {metricFindings.map((f) => (
                <div key={f.key} className={`rounded-xl border p-3 ${f.severity === "info" ? "border-border/60 yt-glass" : "border-amber-500/40 bg-amber-500/5"}`}>
                  <p className="text-[12px] text-muted-foreground">{f.title}</p>
                  <p className="text-[18px] mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{f.figures[0].display}</p>
                  {f.figures[0].comparison && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">vs {f.figures[0].comparison.display} · {f.figures[0].comparison.change_display}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">What I did since yesterday</p>
            {view.workDone.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing new since yesterday.</p>
            ) : (
              <ul className="space-y-1">
                {view.workDone.map((w) => (
                  <li key={w.label} className="text-[13px] flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" /> {w.count} {workLabel(w.label, w.count)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: talk to me */}
        <div className="min-w-0 flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Talk to me</p>
          <div ref={scrollRef} className="flex-1 min-h-[280px] max-h-[480px] overflow-y-auto space-y-3 pr-1">
            {thread.map((m) => (
              <div key={m.id} className={m.from === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${m.from === "user" ? "bg-primary text-primary-foreground" : "yt-glass"}`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.table && m.table.length > 0 && (
                    <table className="mt-2 w-full text-[12px]">
                      <tbody>
                        {m.table.map((f) => (
                          <tr key={f.label} className="border-t border-border/30 first:border-0">
                            <td className="py-1 pr-3 text-muted-foreground">{f.label}</td>
                            <td className="py-1 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{f.display}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {m.quote && <QuoteBox text={m.quote} />}
                  {!m.done && m.chips && m.chips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.chips.map((c) => (
                        <button key={c.label} onClick={() => onChip(m, c)}
                          className="h-9 px-3 rounded-full text-[12px] font-medium border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!m.done && m.confirm && (
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => onConfirm(m, true)}
                        className="h-9 px-3 rounded-full text-[12px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                        Confirm
                      </button>
                      <button onClick={() => onConfirm(m, false)}
                        className="h-9 px-3 rounded-full text-[12px] font-medium border border-border/60 hover:bg-muted transition-colors">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {asking && <p className="text-[12px] text-muted-foreground pl-1">Thinking…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };
  return (
    <div className="yt-quote mt-2 p-3">
      <p className="text-[13px] whitespace-pre-wrap">{text}</p>
      <button onClick={copy} className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border border-border/60 hover:bg-muted transition-colors">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
