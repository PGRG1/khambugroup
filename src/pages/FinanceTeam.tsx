import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenues } from "@/hooks/useVenues";
import { PageHeader } from "@/components/expenses/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, ExternalLink, CheckCircle2, RotateCcw, Send } from "lucide-react";
import { fmtDate, fmtRange, localParts, type Finding, type SpecialistReport, type Synthesis } from "../../supabase/functions/_shared/financeTeamReview";
import { nextScheduledRun } from "@/utils/financeTeamSchedule";

type ReviewType = "daily" | "weekly";
const ALL = "__all__";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Review {
  id: string; tenant_id: string; venue_id: string | null; venue_label: string; review_type: ReviewType;
  period_start: string; period_end: string; comparison_start: string | null; comparison_end: string | null;
  trigger_source: string; status: string; ai_status: string | null; ai_model: string | null; context: any;
  specialists: SpecialistReport[]; synthesis: Synthesis; prior_actions: any[]; error: string | null; generated_at: string | null; started_at: string;
}
interface Action {
  id: string; review_id: string; finding_key: string; specialist: string; title: string; recommendation: string; evidence: any[];
  assignee_id: string | null; due_date: string | null; status: "open" | "completed"; accepted_at: string; completed_at: string | null;
}
interface Member { user_id: string; display_name: string }

const db = supabase as any;
const fmtTs = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const AI_LABEL: Record<string, { text: string; chip: string }> = {
  ai: { text: "AI interpretation of calculated figures", chip: "chip-info" },
  deterministic_no_key: { text: "Rule-based review — AI is not configured", chip: "chip-neutral" },
  deterministic_ai_failed: { text: "Rule-based review — AI was unavailable", chip: "chip-warn" },
  deterministic_ai_rejected: { text: "Rule-based review — AI output failed validation", chip: "chip-warn" },
};
const SEV: Record<string, string> = { action: "chip-danger", watch: "chip-warn", info: "chip-neutral" };
const SEV_LABEL: Record<string, string> = { action: "Needs action", watch: "Watch", info: "Info" };

export default function FinanceTeam() {
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const { venues } = useVenues();
  const [scope, setScope] = useState<string>("");
  const [canAll, setCanAll] = useState(false);
  const [reviewType, setReviewType] = useState<ReviewType>("daily");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [tab, setTab] = useState("briefing");

  const venueId = scope === ALL ? null : scope || null;
  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);

  useEffect(() => {
    if (!tenantId || !user) return;
    db.rpc("ft_can_access_scope", { _user_id: user.id, _tenant_id: tenantId, _venue_id: null }).then(({ data }: any) => {
      setCanAll(!!data);
      setScope((s) => s || (data ? ALL : ""));
    });
  }, [tenantId, user]);
  useEffect(() => { if (!scope && !canAll && activeVenues[0]) setScope(activeVenues[0].id); }, [scope, canAll, activeVenues]);

  const load = useCallback(async () => {
    if (!tenantId || !scope) return;
    let rq = db.from("finance_team_reviews").select("*").eq("tenant_id", tenantId);
    rq = venueId ? rq.eq("venue_id", venueId) : rq.is("venue_id", null);
    let aq = db.from("finance_team_actions").select("*").eq("tenant_id", tenantId);
    aq = venueId ? aq.eq("venue_id", venueId) : aq.is("venue_id", null);
    const [r, a, m] = await Promise.all([
      rq.order("started_at", { ascending: false }).limit(100),
      aq.order("accepted_at", { ascending: false }),
      db.rpc("ft_assignable_members", { _tenant_id: tenantId, _venue_id: venueId }),
    ]);
    if (r.error) toast({ title: "Could not load reviews", description: r.error.message, variant: "destructive" });
    const list = (r.data ?? []) as Review[];
    setReviews(list);
    setActions((a.data ?? []) as Action[]);
    setMembers((m.data ?? []) as Member[]);
    setSelectedId((cur) => (cur && list.some((x) => x.id === cur) ? cur : list.find((x) => x.status === "completed" && x.review_type === reviewType)?.id ?? list.find((x) => x.status === "completed")?.id ?? null));
  }, [tenantId, scope, venueId, reviewType]);
  useEffect(() => { load(); }, [load]);

  const selected = reviews.find((r) => r.id === selectedId) ?? null;
  const runningRemote = reviews.some((r) => r.status === "running" && Date.now() - Date.parse(r.started_at) < 10 * 60000);

  const runNow = async () => {
    if (!tenantId || running) return;
    setRunning(true); setRunError(null);
    const { data, error } = await supabase.functions.invoke("finance-team", { body: { mode: "run", tenant_id: tenantId, venue_id: venueId, review_type: reviewType } });
    setRunning(false);
    let msg: string | null = null;
    if (error) {
      msg = error.message;
      try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* keep */ }
    } else if ((data as any)?.error) msg = (data as any).error;
    if (msg) { setRunError(msg); await load(); return; }
    toast({ title: "Review ready", description: (data as any).ai_status === "ai" ? "Briefing prepared." : "Rule-based briefing prepared — see the note on AI status." });
    setSelectedId((data as any).review_id);
    setTab("briefing");
    await load();
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Finance review" title="Your Finance Team"
        description="Revenue Manager, Procurement Manager and Financial Controller review your saved data; the Finance Director summarises what needs attention."
        actions={<>
          <Select value={scope} onValueChange={(v) => { setScope(v); setSelectedId(null); }}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Venue" /></SelectTrigger>
            <SelectContent>
              {canAll && <SelectItem value={ALL}>All venues</SelectItem>}
              {activeVenues.filter((v) => v.id).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={reviewType} onValueChange={(v) => setReviewType(v as ReviewType)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="daily">Daily review</SelectItem><SelectItem value="weekly">Weekly review</SelectItem></SelectContent>
          </Select>
          <Button size="sm" onClick={runNow} disabled={running || runningRemote || !scope}>
            {running || runningRemote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running || runningRemote ? "Review running…" : "Run review now"}
          </Button>
        </>} />

      {runError && <div className="card-glass rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Review could not be prepared: {runError}</div>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="briefing">Briefing</TabsTrigger>
          <TabsTrigger value="reports">Team reports</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="past">Past reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="briefing" className="space-y-4">
          {!selected ? <Empty text={`No saved ${reviewType} review for this scope yet. Run a review to prepare one.`} /> : <>
            <ReviewMeta review={selected} />
            <Briefing review={selected} actions={actions} members={members} tenantId={tenantId!} userId={user?.id} onChanged={load} />
            <AskTeam review={selected} tenantId={tenantId!} />
          </>}
          <ScheduleCard tenantId={tenantId} venueId={venueId} scope={scope} userId={user?.id} />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          {!selected ? <Empty text="No saved review selected." /> : <>
            <ReviewMeta review={selected} />
            <TeamReports review={selected} actions={actions} members={members} tenantId={tenantId!} userId={user?.id} onChanged={load} />
          </>}
        </TabsContent>

        <TabsContent value="actions"><ActionsList actions={actions} members={members} reviews={reviews} onChanged={load} onOpen={(id) => { setSelectedId(id); setTab("briefing"); }} /></TabsContent>

        <TabsContent value="past"><PastReviews reviews={reviews} actions={actions} onOpen={(id) => { setSelectedId(id); setTab("briefing"); }} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card-glass rounded-xl p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function ReviewMeta({ review }: { review: Review }) {
  const ai = AI_LABEL[review.ai_status ?? ""];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="text-foreground font-medium">{review.venue_label}</span>
      <span>· {review.review_type === "daily" ? "Daily" : "Weekly"} review · {fmtRange(review.period_start, review.period_end)}</span>
      {review.comparison_start && <span>· compared with {fmtRange(review.comparison_start, review.comparison_end!)}</span>}
      <span>· saved {fmtTs(review.generated_at)} ({review.trigger_source})</span>
      {ai && <span className={`chip ${ai.chip}`} title={review.context?.ai?.error ?? ""}>{ai.text}</span>}
    </div>
  );
}

function EvidenceLinks({ links }: { links: { label: string; route: string }[] }) {
  if (!links?.length) return null;
  return <div className="flex flex-wrap gap-3">{links.map((l) => (
    <Link key={l.route + l.label} to={l.route} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" />{l.label}</Link>
  ))}</div>;
}

interface ActionCtx { review: Review; actions: Action[]; members: Member[]; tenantId: string; userId?: string; onChanged: () => void }

function Briefing({ review, ...ctx }: ActionCtx) {
  const s = review.synthesis;
  const findings = review.specialists.flatMap((sp) => sp.findings.map((f) => ({ ...f, specialist: sp.role })));
  const prior = review.prior_actions ?? [];
  return (
    <div className="space-y-4">
      {prior.length > 0 && (
        <div className="card-glass rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold">Follow-up on accepted actions</h3>
          {prior.map((p: any) => (
            <div key={p.id} className="text-xs flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-0">
              <div className="flex items-center gap-2"><span className={`chip ${p.status === "completed" ? "chip-success" : p.overdue ? "chip-danger" : "chip-warn"}`}>{p.status === "completed" ? "Completed" : p.overdue ? "Overdue" : "Open"}</span><span className="font-medium text-foreground">{p.title}</span>{p.due_date && <span className="text-muted-foreground">due {fmtDate(p.due_date)}</span>}</div>
              <span className="text-muted-foreground">{p.evaluation}</span>
            </div>
          ))}
        </div>
      )}
      <div className="card-glass rounded-xl p-5 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Finance Director</div>
          <h2 className="text-lg font-display font-semibold">{s.headline}</h2>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">What changed</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">{s.what_changed.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">Profit and cash</h3>
          <p className="text-sm">{s.profit_cash_implication}</p>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">Top priorities</h3>
          {s.priorities.length === 0 ? <p className="text-sm text-muted-foreground">No recommendations in this review.</p> :
            <div className="space-y-3">{s.priorities.map((p) => {
              const f = findings.find((x) => x.key === p.finding_key);
              return (
                <div key={p.finding_key} className="rounded-lg border border-border/50 p-3 space-y-1.5">
                  <div className="text-sm font-medium">{p.title}</div>
                  <p className="text-xs text-muted-foreground">{p.why}</p>
                  {p.recommendation && <p className="text-sm">Recommendation: {p.recommendation}</p>}
                  {f && <div className="flex flex-wrap items-center justify-between gap-2"><EvidenceLinks links={f.evidence} /><AcceptButton finding={f} specialist={f.specialist} review={review} {...ctx} /></div>}
                </div>
              );
            })}</div>}
        </div>
      </div>
    </div>
  );
}

function TeamReports({ review, ...ctx }: ActionCtx) {
  const [role, setRole] = useState<string>("revenue");
  const sp = review.specialists.find((s) => s.role === role);
  const labels: Record<string, string> = { revenue: "Revenue", procurement: "Procurement", accounting: "Accounting & cash" };
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">{review.specialists.map((s) => (
        <Button key={s.role} size="sm" variant={role === s.role ? "default" : "outline"} onClick={() => setRole(s.role)}>{labels[s.role]}</Button>
      ))}</div>
      {sp && (
        <div className="card-glass rounded-xl p-5 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">{sp.name}</div>
            <p className="text-sm">{sp.summary}</p>
          </div>
          {sp.findings.map((f) => <FindingCard key={f.key} f={f} specialist={sp.role} review={review} {...ctx} />)}
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Data freshness:</span> {sp.data_quality.freshness}</div>
            <div><span className="text-muted-foreground">Completeness:</span> {sp.data_quality.completeness} · Sources: {sp.data_quality.sources.join(", ")}</div>
            {sp.data_quality.limitations.map((l, i) => <div key={i} className="text-muted-foreground">• {l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function FindingCard({ f, specialist, review, ...ctx }: { f: Finding; specialist: string } & ActionCtx) {
  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2">
      <div className="flex items-center gap-2"><span className={`chip ${f.assessable ? SEV[f.severity] : "chip-neutral"}`}>{f.assessable ? SEV_LABEL[f.severity] : "Cannot assess"}</span><span className="text-sm font-medium">{f.title}</span></div>
      <p className="text-sm">{f.statement}</p>
      {f.figures.length > 0 && (
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="text-left font-medium py-1">Figure</th><th className="text-right font-medium">Value</th><th className="text-right font-medium">Comparison</th><th className="text-right font-medium">Change</th></tr></thead>
          <tbody>{f.figures.map((x) => (
            <tr key={x.label} className="border-t border-border/30">
              <td className="py-1">{x.label} <span className="text-muted-foreground">({x.unit})</span></td>
              <td className="text-right td-num">{x.display}</td>
              <td className="text-right td-num text-muted-foreground" title={x.comparison?.label}>{x.comparison ? x.comparison.display : "—"}</td>
              <td className="text-right td-num">{x.comparison ? x.comparison.change_display : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {f.recommendation && <p className="text-sm text-muted-foreground">Recommendation: <span className="text-foreground">{f.recommendation}</span></p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><EvidenceLinks links={f.evidence} />{f.recommendation && <AcceptButton finding={f} specialist={specialist} review={review} {...ctx} />}</div>
    </div>
  );
}

function AcceptButton({ finding, specialist, review, actions, members, tenantId, userId, onChanged }: { finding: Finding; specialist: string } & ActionCtx) {
  const existing = actions.find((a) => a.review_id === review.id && a.finding_key === finding.key);
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  if (existing) return <span className="chip chip-success">Accepted · {existing.status === "completed" ? "completed" : "open"}</span>;
  if (!finding.recommendation) return null;
  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await db.from("finance_team_actions").insert({
      tenant_id: tenantId, venue_id: review.venue_id, review_id: review.id, finding_key: finding.key, specialist,
      title: finding.title, recommendation: finding.recommendation, evidence: finding.evidence,
      assignee_id: assignee === "unassigned" ? null : assignee, due_date: due || null, accepted_by: userId,
    });
    setSaving(false);
    if (error) { toast({ title: "Could not accept", description: error.message, variant: "destructive" }); return; }
    setOpen(false); toast({ title: "Action accepted" }); onChanged();
  };
  return (<>
    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>Accept recommendation</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Accept recommendation</DialogTitle></DialogHeader>
        <p className="text-sm">{finding.recommendation}</p>
        <div className="space-y-3">
          <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Owner</label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="unassigned">Leave unassigned</SelectItem>{members.filter((m) => m.user_id).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><label className="text-[11px] font-medium text-muted-foreground">Due date</label>
            <Input type="date" className="h-8 text-xs md:text-xs" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Accept</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>);
}

function ActionsList({ actions, members, reviews, onChanged, onOpen }: { actions: Action[]; members: Member[]; reviews: Review[]; onChanged: () => void; onOpen: (id: string) => void }) {
  const [history, setHistory] = useState<Record<string, any[]>>({});
  const nameOf = (id: string | null) => (id ? members.find((m) => m.user_id === id)?.display_name ?? "Former member" : "Unassigned");
  const update = async (a: Action, patch: Partial<Action>) => {
    const { error } = await db.from("finance_team_actions").update(patch).eq("id", a.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" }); else onChanged();
  };
  const loadHistory = async (id: string) => {
    const { data } = await db.from("finance_team_action_events").select("*").eq("action_id", id).order("created_at");
    setHistory((h) => ({ ...h, [id]: data ?? [] }));
  };
  if (!actions.length) return <Empty text="No accepted actions yet. Accept a recommendation from a review to track it here." />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-2">
      {actions.map((a) => {
        const r = reviews.find((x) => x.id === a.review_id);
        return (
          <div key={a.id} className="card-glass rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${a.status === "completed" ? "chip-success" : a.due_date && a.due_date < today ? "chip-danger" : "chip-warn"}`}>{a.status === "completed" ? "Completed" : a.due_date && a.due_date < today ? "Overdue" : "Open"}</span>
              <span className="text-sm font-medium">{a.title}</span>
              <span className="text-xs text-muted-foreground">accepted {fmtTs(a.accepted_at)}</span>
            </div>
            <p className="text-sm">{a.recommendation}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Select value={a.assignee_id ?? "unassigned"} onValueChange={(v) => update(a, { assignee_id: v === "unassigned" ? null : v })}>
                <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue>{nameOf(a.assignee_id)}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{members.filter((m) => m.user_id).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" className="h-7 w-[150px] text-xs md:text-xs" value={a.due_date ?? ""} onChange={(e) => update(a, { due_date: e.target.value || null })} />
              {a.status === "open"
                ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => update(a, { status: "completed" })}><CheckCircle2 className="h-3.5 w-3.5" />Mark complete</Button>
                : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => update(a, { status: "open" })}><RotateCcw className="h-3.5 w-3.5" />Reopen</Button>}
              {r && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen(r.id)}>Source review ({fmtRange(r.period_start, r.period_end)})</Button>}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadHistory(a.id)}>History</Button>
            </div>
            <EvidenceLinks links={a.evidence} />
            {history[a.id] && <div className="text-xs text-muted-foreground space-y-0.5">{history[a.id].map((h) => (
              <div key={h.id}>{fmtTs(h.created_at)} · {h.event} by {nameOf(h.actor_id)}{h.details?.status_to ? ` · ${h.details.status_from} → ${h.details.status_to}` : ""}</div>
            ))}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PastReviews({ reviews, actions, onOpen }: { reviews: Review[]; actions: Action[]; onOpen: (id: string) => void }) {
  if (!reviews.length) return <Empty text="No reviews saved for this scope yet." />;
  return (
    <div className="card-glass rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground border-b border-border/50"><th className="text-left font-medium px-3 py-2">Period</th><th className="text-left font-medium">Type</th><th className="text-left font-medium">Status</th><th className="text-left font-medium">Saved</th><th className="text-left font-medium">Source</th><th className="text-right font-medium px-3">Actions completed</th><th /></tr></thead>
        <tbody>{reviews.map((r) => {
          const acts = actions.filter((a) => a.review_id === r.id);
          return (
            <tr key={r.id} className="border-b border-border/30">
              <td className="px-3 py-2">{fmtRange(r.period_start, r.period_end)}</td>
              <td>{r.review_type === "daily" ? "Daily" : "Weekly"}</td>
              <td><span className={`chip ${r.status === "completed" ? "chip-success" : r.status === "failed" ? "chip-danger" : "chip-info"}`}>{r.status}</span>{r.error && <span className="ml-2 text-destructive">{r.error}</span>}</td>
              <td>{fmtTs(r.generated_at ?? r.started_at)}</td>
              <td>{r.trigger_source}{r.ai_status ? ` · ${r.ai_status === "ai" ? "AI" : "rule-based"}` : ""}</td>
              <td className="text-right td-num px-3">{acts.filter((a) => a.status === "completed").length} / {acts.length}</td>
              <td className="px-3">{r.status === "completed" && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen(r.id)}>Open</Button>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function AskTeam({ review, tenantId }: { review: Review; tenantId: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ q: string; a?: any; error?: string }[]>([]);
  useEffect(() => { setTurns([]); }, [review.id]);
  const ask = async () => {
    const question = q.trim(); if (!question || busy) return;
    setBusy(true); setQ("");
    const { data, error } = await supabase.functions.invoke("finance-team", { body: { mode: "ask", tenant_id: tenantId, review_id: review.id, question } });
    let msg: string | null = null;
    if (error) { msg = error.message; try { const c = await (error as any).context?.json?.(); if (c?.error) msg = c.error; } catch { /* keep */ } }
    setTurns((t) => [...t, msg ? { q: question, error: msg } : { q: question, a: data }]);
    setBusy(false);
  };
  return (
    <div className="card-glass rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold">Ask your team about this review</h3>
      {turns.map((t, i) => (
        <div key={i} className="space-y-1 text-sm">
          <div className="text-muted-foreground">You: {t.q}</div>
          {t.error ? <div className="text-destructive">{t.error}</div> : <div className="space-y-1">
            {!t.a.can_answer && <span className="chip chip-warn">Cannot answer from this review</span>}
            <p className="whitespace-pre-wrap">{t.a.answer}</p>
            {t.a.mode === "deterministic" && <p className="text-xs text-muted-foreground">AI is not configured — showing matching findings.</p>}
            <EvidenceLinks links={t.a.evidence} />
          </div>}
        </div>
      ))}
      <div className="flex gap-2">
        <Input className="h-8 text-xs md:text-xs" placeholder="e.g. Which payables are overdue?" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) ask(); }} />
        <Button size="sm" onClick={ask} disabled={busy || !q.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Ask</Button>
      </div>
    </div>
  );
}

function ScheduleCard({ tenantId, venueId, scope, userId }: { tenantId: string | null; venueId: string | null; scope: string; userId?: string }) {
  const [pref, setPref] = useState<any>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tz, setTz] = useState("Asia/Hong_Kong");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!tenantId || !scope) return;
    (async () => {
      let q = db.from("finance_team_schedules").select("*").eq("tenant_id", tenantId);
      q = venueId ? q.eq("venue_id", venueId) : q.is("venue_id", null);
      const [{ data }, { data: on }, { data: t }] = await Promise.all([q.maybeSingle(), db.rpc("finance_team_scheduler_enabled"), db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle()]);
      const zone = t?.timezone || "Asia/Hong_Kong";
      setTz(zone); setEnabled(!!on);
      setPref(data ?? { daily_enabled: false, daily_hour: 8, weekly_enabled: false, weekly_day: 1, weekly_hour: 9, timezone: zone });
    })();
  }, [tenantId, venueId, scope]);
  if (!pref) return null;
  const save = async (patch: any) => {
    if (!tenantId || !userId) return;
    const next = { ...pref, ...patch };
    setPref(next); setSaving(true);
    const row = { tenant_id: tenantId, venue_id: venueId, timezone: tz, daily_enabled: next.daily_enabled, daily_hour: next.daily_hour, weekly_enabled: next.weekly_enabled, weekly_day: next.weekly_day, weekly_hour: next.weekly_hour, updated_by: userId, updated_at: new Date().toISOString() };
    const res = next.id ? await db.from("finance_team_schedules").update(row).eq("id", next.id).select().single() : await db.from("finance_team_schedules").insert(row).select().single();
    setSaving(false);
    if (res.error) toast({ title: "Could not save schedule", description: res.error.message, variant: "destructive" }); else setPref(res.data);
  };
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hh = (h: number) => `${String(h).padStart(2, "0")}:05`;
  const now = new Date();
  const nextDaily = pref.daily_enabled ? nextScheduledRun(now, tz, pref.daily_hour, null) : null;
  const nextWeekly = pref.weekly_enabled ? nextScheduledRun(now, tz, pref.weekly_hour, pref.weekly_day) : null;
  const local = localParts(now, tz);
  return (
    <div className="card-glass rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Automatic preparation</h3>
        {enabled === false && <span className="chip chip-warn">Scheduler not enabled — manual reviews only</span>}
        {enabled && <span className="chip chip-success">Scheduler active (checks hourly)</span>}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </div>
      <p className="text-xs text-muted-foreground">Times are in {tz} (today {fmtDate(local.date)}). Reviews are saved here only — no emails or messages are sent.</p>
      <div className="grid gap-3 md:grid-cols-2 text-xs">
        <div className="rounded-lg border border-border/50 p-3 space-y-2">
          <div className="flex items-center justify-between"><span className="font-medium">Daily review (previous day)</span><Switch checked={pref.daily_enabled} onCheckedChange={(v) => save({ daily_enabled: v })} /></div>
          <Select value={String(pref.daily_hour)} onValueChange={(v) => save({ daily_hour: Number(v) })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{hours.map((h) => <SelectItem key={h} value={String(h)}>{hh(h)}</SelectItem>)}</SelectContent>
          </Select>
          <div className="text-muted-foreground">Last run: {fmtTs(pref.last_daily_run_at)} · Next: {nextDaily && enabled ? fmtTs(nextDaily.toISOString()) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border/50 p-3 space-y-2">
          <div className="flex items-center justify-between"><span className="font-medium">Weekly review (previous 7 days)</span><Switch checked={pref.weekly_enabled} onCheckedChange={(v) => save({ weekly_enabled: v })} /></div>
          <div className="flex gap-2">
            <Select value={String(pref.weekly_day)} onValueChange={(v) => save({ weekly_day: Number(v) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(pref.weekly_hour)} onValueChange={(v) => save({ weekly_hour: Number(v) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{hours.map((h) => <SelectItem key={h} value={String(h)}>{hh(h)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="text-muted-foreground">Last run: {fmtTs(pref.last_weekly_run_at)} · Next: {nextWeekly && enabled ? fmtTs(nextWeekly.toISOString()) : "—"}</div>
        </div>
      </div>
      {pref.last_error && <p className="text-xs text-destructive">Last scheduled run problem: {pref.last_error}</p>}
    </div>
  );
}
