import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AudioLines, Mic, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import { PixelAvatar } from "@/components/team/PixelAvatar";
import "@/components/team/team.css";
import { useBaniTopic, useFloatingBaniAttach } from "@/components/assistant/FloatingBaniContext";
import { formatCurrency, formatDate } from "@/utils/format";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { ROLES, roleViews, type Review, type Role, type RoleView } from "./YourTeam";
import type { Finding } from "../../supabase/functions/_shared/financeTeamReview";
import {
  byWeekday, compare, guestsPerDay, mtdWindows, salesPerDay, spendPerGuest, WEEKDAYS, type Compare, type SaleRow,
} from "@/utils/landingNumbers";
import "./landing.css";

const SHORT: Record<Role, string> = { revenue: "Sales", procurement: "Purchasing", people: "People", accountant: "Books", controller: "Cash" };
const ORDER: Role[] = ["revenue", "procurement", "people", "accountant", "controller"];
type Panel = { title: string; role?: Role; paras: string[]; facts?: [string, string][]; whys?: string[]; actions?: { label: string; to: string }[]; link?: { label: string; to: string } };
type Card = { label: string; cmp: Compare; fmt: (n: number) => string; unit: string; rows: [SaleRow[], SaleRow[]] };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, left: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); setBox({ w: r.width, left: r.left }); };
    const ro = new ResizeObserver(read); ro.observe(el); window.addEventListener("resize", read); read();
    return () => { ro.disconnect(); window.removeEventListener("resize", read); };
  }, []);
  return [ref, box.w, box.left] as const;
}

function useDictation(onText: (t: string) => void) {
  const [on, setOn] = useState(false);
  const recRef = useRef<any>(null);
  const SR = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const toggle = () => {
    if (!SR) return;
    if (on) { recRef.current?.stop(); return; }
    const rec = new SR(); rec.interimResults = false;
    rec.onresult = (e: any) => onText(Array.from(e.results).map((r: any) => r[0].transcript).join(" "));
    rec.onend = () => setOn(false);
    recRef.current = rec; rec.start(); setOn(true);
  };
  return { on, toggle, supported: !!SR };
}

function Composer({ placeholder, onSend, onAttach }: { placeholder: string; onSend: (t: string) => void; onAttach?: (f: File[]) => void }) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dict = useDictation((t) => setText((p) => (p ? `${p} ${t}` : t)));
  return (
    <form className="ld-pill" onSubmit={(e) => { e.preventDefault(); onSend(text.trim()); setText(""); }}>
      {onAttach && (<>
        <button type="button" className="ld-ic" aria-label="Attach a file" onClick={() => fileRef.current?.click()}><Plus size={18} /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onAttach(f); e.target.value = ""; }} />
      </>)}
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {dict.supported && <button type="button" className={`ld-ic ${dict.on ? "on" : ""}`} aria-label="Dictate" onClick={dict.toggle}><Mic size={18} /></button>}
      <button type="button" className="ld-ic dark" aria-label="Talk to Bani" onClick={() => onSend(text.trim())}><AudioLines size={18} /></button>
    </form>
  );
}

const roleLabel = (r: string) => (["tenant_admin", "platform_admin", "super_admin", "owner", "admin"].includes(r) ? "Owner" : r === "manager" ? "Manager" : r ? "Team" : "");
/** Short next step (2–4 words) from the finding's evidence label or recommendation. */
function stepLabel(f: Finding): string {
  const ev = f.evidence?.[0]?.label?.trim();
  if (ev && ev.split(/\s+/).length <= 4 && !/^open$/i.test(ev)) return ev;
  const rec = (f.recommendation ?? "").split(/[.,;:—–(]/)[0].trim().split(/\s+/).slice(0, 4).join(" ");
  return rec ? rec.charAt(0).toUpperCase() + rec.slice(1) : "Take a look";
}
const AREA: Record<Role, { label: string; to: string }> = {
  revenue: { label: "Open Revenue", to: "/revenue" }, procurement: { label: "Open invoices", to: "/procurement/invoices" },
  people: { label: "Open payroll", to: "/hr/payroll" }, accountant: { label: "Open Books", to: "/finance/books" }, controller: { label: "Open Bank & cash", to: "/finance/cash" },
};
function findingLink(r: Role, key: string) {
  if (/missing|payment_mismatch|sales_records/.test(key) && r === "revenue") return { label: "Open sales records", to: "/sales-data" };
  if (/bank|settlement/.test(key)) return { label: "Open Bank & cash", to: "/finance/cash" };
  if (/invoice|bill|payable|supplier|price|dispute/.test(key)) return { label: "Open invoices", to: "/procurement/invoices" };
  if (/payroll|overtime|leave|roster/.test(key)) return { label: "Open payroll", to: "/hr/payroll" };
  return AREA[r];
}
const pct = (c: number | null) => (c == null ? null : `${c > 0 ? "+" : c < 0 ? "−" : ""}${Math.abs(Math.round(c))}%`);

export default function Landing() {
  const { user } = useAuth();
  const { tenantId, memberships } = useActiveTenant();
  const vs = useVenueScope();
  const openTopic = useBaniTopic();
  const attach = useFloatingBaniAttach();
  const [ref, width, left] = useWidth();
  const size = width >= 1100 ? "wide" : width >= 700 ? "tab" : "ph";
  const [panel, setPanel] = useState<Panel | null>(null);
  const scopeIds = vs.filterIds;
  const venueId = scopeIds && scopeIds.length === 1 ? scopeIds[0] : null;
  const mixed = !!scopeIds && scopeIds.length > 1;
  const shownVenues = scopeIds ? vs.venues.filter((v) => scopeIds.includes(v.id)) : vs.venues;

  const profile = useQuery({
    queryKey: ["landing", "profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await supabase.from("profiles").select("display_name").eq("user_id", user!.id).maybeSingle()).data?.display_name ?? "",
  });
  const first = (profile.data || (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "").split(/\s+/)[0];
  const role = memberships.find((m) => m.tenant_id === tenantId)?.role ?? "";
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Finance-team engine: latest completed review for this scope (same read as Your team).
  const reviewQ = useQuery({
    queryKey: ["landing", "review", tenantId, venueId],
    enabled: !!tenantId && vs.ready && !mixed,
    queryFn: async (): Promise<Review | null> => {
      let q = (supabase as any).from("finance_team_reviews")
        .select("id,venue_id,venue_label,review_type,period_start,period_end,status,generated_at,specialists,synthesis")
        .eq("tenant_id", tenantId).eq("status", "completed").order("generated_at", { ascending: false }).limit(1);
      q = venueId ? q.eq("venue_id", venueId) : q.is("venue_id", null);
      const { data, error } = await q; if (error) throw error;
      return (data?.[0] ?? null) as Review | null;
    },
  });
  const views = useMemo(() => (reviewQ.data ? roleViews(reviewQ.data) : []), [reviewQ.data]);
  const viewOf = (r: Role) => views.find((v) => v.role === r);
  const forYou = (v?: RoleView) => (v?.findings ?? []).filter((f) => f.recommendation && (f.severity === "action" || f.severity === "watch"));
  const needs = useMemo(() => ORDER.flatMap((r) => forYou(viewOf(r)).map((f) => ({ role: r, f })))
    .sort((a, b) => (a.f.severity === "action" ? 0 : 1) - (b.f.severity === "action" ? 0 : 1)), [views]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sales: this month to date vs same days last year.
  const win = mtdWindows(now);
  const salesQ = useQuery({
    queryKey: ["landing", "sales", tenantId, scopeIds?.join(",") ?? "all", win.to],
    enabled: !!tenantId,
    queryFn: async () => {
      const all = await fetchAllRows("sales_records", "date,venue_id,subtotal,service_charge,guests", { col: "date", asc: true }, tenantId, true);
      const sc = (r: any) => !scopeIds || scopeIds.includes(r.venue_id);
      const rows = (all as SaleRow[]).filter(sc);
      const inR = (a: string, b: string) => rows.filter((r) => r.date >= a && r.date <= b);
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const eightAgo = new Date(now); eightAgo.setDate(now.getDate() - 56);
      return { cur: inR(win.from, win.to), ly: inR(win.lyFrom, win.lyTo), week: inR(iso(weekStart), iso(now)), recent: inR(iso(eightAgo), iso(now)) };
    },
  });
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const invQ = useQuery({
    queryKey: ["landing", "inv", tenantId, prevMonth.getMonth()],
    enabled: !!tenantId,
    queryFn: async () => {
      const a = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
      const b = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      const { count } = await (supabase as any).from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("invoice_date", a).lte("invoice_date", b);
      return count ?? 0;
    },
  });

  const cards: Card[] = useMemo(() => {
    const s = salesQ.data; if (!s) return [];
    const money = (n: number) => formatCurrency(Math.round(n)).replace(/\.00$/, "");
    const out: Card[] = [];
    const venueCards = shownVenues.length > 1
      ? [...shownVenues].map((v) => ({ v, cur: s.cur.filter((r) => r.venue_id === v.id), ly: s.ly.filter((r) => r.venue_id === v.id) }))
          .sort((a, b) => (salesPerDay(b.cur).value ?? 0) - (salesPerDay(a.cur).value ?? 0)).slice(0, 2)
          .map(({ v, cur, ly }) => ({ label: `${v.name} · sales a day`, cmp: compare(salesPerDay(cur), salesPerDay(ly)), fmt: money, unit: "a day", rows: [cur, ly] as [SaleRow[], SaleRow[]] }))
      : [{ label: "Sales a day", cmp: compare(salesPerDay(s.cur), salesPerDay(s.ly)), fmt: money, unit: "a day", rows: [s.cur, s.ly] as [SaleRow[], SaleRow[]] }];
    out.push(...venueCards);
    out.push({ label: "Guests a day", cmp: compare(guestsPerDay(s.cur), guestsPerDay(s.ly)), fmt: (n) => Math.round(n).toLocaleString("en-HK"), unit: "a day", rows: [s.cur, s.ly] });
    out.push({ label: "Spend per guest", cmp: compare(spendPerGuest(s.cur), spendPerGuest(s.ly)), fmt: money, unit: "per guest", rows: [s.cur, s.ly] });
    if (out.length < 4) {
      const tot = (rows: SaleRow[]) => rows.length ? { value: rows.reduce((a, r) => a + (Number(r.subtotal) || 0) + (Number(r.service_charge) || 0), 0) } : { value: null, why: "no sales recorded" };
      out.splice(1, 0, { label: "Sales month to date", cmp: compare(tot(s.cur), tot(s.ly)), fmt: money, unit: "", rows: [s.cur, s.ly] });
    }
    return out;
  }, [salesQ.data, shownVenues]); // eslint-disable-line react-hooks/exhaustive-deps

  const gaps: string[] = [];
  if (invQ.data === 0) gaps.push(`Food cost can't be read yet: ${prevMonth.toLocaleString("en-GB", { month: "long" })}'s invoices aren't in`);
  if (salesQ.data && !salesQ.data.ly.length) gaps.push("Last year can't be compared: there are no sales for the same days last year");
  if (win.noDaysYet) gaps.push("This month has no finished days yet");

  const brief = useMemo(() => {
    const out: string[] = [];
    const main = cards[0]; const g = cards.find((c) => c.label === "Guests a day"); const sp = cards.find((c) => c.label === "Spend per guest");
    if (main?.cmp.now.value != null) {
      out.push(main.cmp.changePct != null
        ? `${main.label.replace(" · sales a day", "")} is taking ${main.fmt(main.cmp.now.value)} a day this month, ${pct(main.cmp.changePct)} on the same days last year.`
        : `${main.label.replace(" · sales a day", "")} is taking ${main.fmt(main.cmp.now.value)} a day this month; there is nothing from last year to compare it with.`);
    } else out.push("There are no sales recorded for this month yet.");
    if (g?.cmp.changePct != null && sp?.cmp.changePct != null) {
      out.push(Math.abs(g.cmp.changePct) >= Math.abs(sp.cmp.changePct)
        ? `Most of the change is in guests (${pct(g.cmp.changePct)} a day) rather than spend per guest (${pct(sp.cmp.changePct)}).`
        : `Most of the change is in spend per guest (${pct(sp.cmp.changePct)}) rather than guests (${pct(g.cmp.changePct)} a day).`);
    }
    if (needs.length) out.push(`${needs.length === 1 ? "One thing needs" : `${needs.length} things need`} you today.`);
    return out.slice(0, 3);
  }, [cards, needs]);
  const questions = [cards[0]?.cmp.changePct != null && cards[0].cmp.changePct < 0 ? "Why are sales down on last year?" : "What's driving sales this month?", "Which days are we busiest this month?"];

  const openMate = (r: Role) => {
    const v = viewOf(r); const m = ROLES.find((x) => x.key === r)!;
    const done = (v?.workDone ?? []).filter((w) => w.count > 0);
    const wait = forYou(v);
    setPanel({
      title: SHORT[r], role: r,
      paras: [v?.summary || (reviewQ.data ? `${m.sub}. Nothing to report.` : "Your team hasn't prepared an update for this view yet."),
        done.length ? "" : "Nothing done in the last day.", "Bani never sends, approves or pays anything by itself."].filter(Boolean),
      facts: [...done.map((w) => [w.label, String(w.count)] as [string, string]), ...wait.map((f) => ["Waiting on you", f.title] as [string, string])],
      whys: wait.map((f) => `Why: ${f.statement}`),
      actions: wait.flatMap((f) => f.evidence.slice(0, 1).map((e) => ({ label: e.label, to: e.route }))),
      link: AREA[r],
    });
  };
  const openFinding = (r: Role, f: Finding) => setPanel({
    title: f.title, role: r, paras: [f.statement, f.recommendation ? `Suggested: ${f.recommendation}` : ""].filter(Boolean),
    facts: f.figures.map((x) => [x.label, x.display] as [string, string]),
    actions: f.evidence.map((e) => ({ label: e.label, to: e.route })),
    link: findingLink(r, f.key),
  });
  const openCard = (c: Card) => {
    const isSales = c.unit === "a day" && c.label.includes("ales");
    const [a, b] = c.rows;
    const ty = byWeekday(a), ly = byWeekday(b);
    setPanel({
      title: c.label,
      paras: [c.cmp.now.value != null ? `This month to date: ${c.fmt(c.cmp.now.value)} ${c.unit}.` : `Can't be worked out: ${c.cmp.now.why}.`,
        c.cmp.last.value != null ? `Same days last year: ${c.fmt(c.cmp.last.value)} ${c.unit}.` : `Last year: ${c.cmp.last.why ?? "nothing to compare"}.`,
        isSales ? "Sales a day by weekday, this year vs last:" : `${a.length} sales records this month, ${b.length} for the same days last year.`],
      facts: isSales ? WEEKDAYS.map((d, i) => [d, `${ty[i] != null ? c.fmt(ty[i]!) : "—"} · ${ly[i] != null ? c.fmt(ly[i]!) : "—"}`] as [string, string]) : undefined,
      link: { label: "Open Revenue", to: "/revenue" },
    });
  };
  const ask = (t: string) => { setPanel(null); openTopic(t); };

  const weekList = useMemo(() => {
    const s = salesQ.data; if (!s) return [];
    const out: { d: string; t: string }[] = [];
    const lbl = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
    // Usual open days per venue over the last 8 weeks (a weekday counts when it traded in at least 3 of 8 weeks).
    const opens = new Map<string, Set<number>>();
    for (const v of shownVenues) {
      const counts = Array(7).fill(0);
      new Set(s.recent.filter((r) => r.venue_id === v.id).map((r) => r.date)).forEach((d) => counts[new Date(`${d}T00:00:00`).getDay()]++);
      const set = new Set(counts.map((c, i) => (c >= 3 ? i : -1)).filter((i) => i >= 0));
      if (set.size) opens.set(v.name, set);
    }
    const weekendTraders = [...opens.values()].some((x) => x.has(0) || x.has(6));
    const dow = now.getDay();
    if (weekendTraders && dow >= 1 && dow <= 6) {
      const mon = new Date(now); mon.setDate(now.getDate() + ((8 - dow) % 7 || 7));
      out.push({ d: lbl(mon), t: "Z-reports for the weekend are due" });
    }
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if ((monthEnd.getTime() - now.getTime()) / 864e5 <= 7) out.push({ d: lbl(monthEnd), t: `Month end: ${monthEnd.toLocaleString("en-GB", { month: "long" })}'s invoices and statements close` });
    const order = [1, 2, 3, 4, 5, 6, 0];
    for (const [name, set] of opens) if (set.size < 7) out.push({ d: "This week", t: `${name} usually opens ${order.filter((i) => set.has(i)).map((i) => WEEKDAYS[i]).join(", ")}` });
    return out.slice(0, 3);
  }, [salesQ.data, shownVenues]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = (r: Role): [string, "ok" | "amb" | "quiet"] => {
    const v = viewOf(r); const w = forYou(v).length; const d = (v?.workDone ?? []).reduce((a, x) => a + x.count, 0);
    if (w) return [`${w} for you`, "amb"]; if (d) return [`${d} done`, "ok"]; return ["quiet", "quiet"];
  };
  const meta = (r: Role) => ROLES.find((x) => x.key === r)!;

  return (
    <div ref={ref} className={`ld ${size}`}>
      <div className="ld-top">
        <div className="ld-hi">
          <BaniOrb size={size === "ph" ? 44 : 56} mode="idle" />
          <div style={{ minWidth: 0 }}>
            <h1 className="ld-h1">{greet}{first ? `, ${first}` : ""}</h1>
            <div className="ld-sub">{formatDate(now.toISOString().slice(0, 10))}{roleLabel(role) ? ` · ${roleLabel(role)}` : ""}</div>
          </div>
        </div>
        <div>
        {size === "wide" && reviewQ.data?.generated_at && <div className="ld-teamh">Your Bani team since {formatDate(reviewQ.data.generated_at.slice(0, 10))}</div>}
        <div className="ld-team" aria-label="Your Bani team">
          {ORDER.map((r) => { const [t, c] = status(r); return (
            <button key={r} className="ld-mate" onClick={() => openMate(r)}>
              <PixelAvatar seed={meta(r).seed} palette={meta(r).pal} size={size === "ph" ? 32 : 40} />
              <b>{SHORT[r]}</b><span><i className={`ld-dot ${c}`} />{t}</span>
            </button>); })}
        </div>
        </div>
      </div>

      <div className="ld-nums">
        {salesQ.isLoading ? [0, 1, 2, 3].map((i) => <div key={i} className="ld-card ld-num"><div className="l">Loading…</div></div>) :
          cards.map((c) => (
            <button key={c.label} className="ld-card ld-num" onClick={() => openCard(c)}>
              <div className="l">{c.label}</div>
              {c.cmp.now.value != null ? <div className="v">{c.fmt(c.cmp.now.value)}</div> : <div className="why">Can't be worked out: {c.cmp.now.why}</div>}
              {c.cmp.changePct != null
                ? <div className={`ld-note ${c.cmp.changePct > 1 ? "up" : c.cmp.changePct < -1 ? "down" : "flat"}`}>{pct(c.cmp.changePct)} {c.unit || "vs last year"}</div>
                : <div className="ld-note flat">{c.cmp.now.value != null ? "Nothing to compare last year" : ""}</div>}
            </button>))}
      </div>
      {gaps.length > 0 && <div className="ld-gap">{gaps.join(" · ")}.</div>}

      <div className="ld-brief">{brief.join(" ")}</div>
      <div className="ld-qs">{questions.map((q, i) => <button key={q} className={`ld-chip ${i ? "" : "solid"}`} onClick={() => ask(q)}>{q}</button>)}</div>

      <div className="ld-cols">
        <div><h2 className="ld-h2">Needs you · {needs.length}</h2>
        <section className="ld-card">
          {mixed ? <div className="ld-empty">Pick one venue or all venues to see what your team found.</div>
            : !reviewQ.data && !reviewQ.isLoading ? <div className="ld-empty">Your team hasn't prepared an update for this view yet.</div>
            : needs.length === 0 ? <div className="ld-empty">Nothing needs you right now.</div>
            : needs.map(({ role: r, f }) => (
              <div key={f.key} className="ld-row">
                <i className={`ld-dot ${f.severity === "action" ? "amb" : "quiet"}`} />
                <div className="grow"><div className="t">{f.title}</div><div className="c">{f.statement}</div></div>
                <button className="ld-btn" onClick={() => openFinding(r, f)}>{stepLabel(f)}</button>
              </div>))}
        </section></div>
        <div className="ld-side">
          <div><h2 className="ld-h2">This week</h2>
          <section className="ld-card" style={{ padding: "8px 0" }}>
            {weekList.length === 0 && <div className="ld-empty">Nothing scheduled this week</div>}
            {weekList.map((w) => <div key={w.d} className="ld-week"><span className="d">{w.d}</span><span>{w.t}</span></div>)}
          </section></div>
          <div><h2 className="ld-h2">Agreed</h2><section className="ld-card"><div className="ld-empty">Nothing agreed yet</div></section></div>
        </div>
      </div>

      <div className="ld-dock" style={{ left: left + width / 2, width: Math.min(760, width - 32) }}><Composer placeholder="Ask Bani, or drop a file" onSend={ask} onAttach={(f) => attach(f)} /></div>
      {panel && <SidePanel panel={panel} sheet={size === "ph"} onClose={() => setPanel(null)} onAsk={ask} />}
    </div>
  );
}

function SidePanel({ panel, sheet, onClose, onAsk }: { panel: Panel; sheet: boolean; onClose: () => void; onAsk: (t: string) => void }) {
  const m = panel.role ? ROLES.find((r) => r.key === panel.role)! : null;
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const body: ReactNode = (
    <>
      {panel.paras.map((p, i) => <p key={i}>{p}</p>)}
      {panel.facts && panel.facts.length > 0 && <div>{panel.facts.map(([l, v], i) => <div key={i} className="ld-fact"><span>{l}</span><span>{v}</span></div>)}</div>}
      {panel.whys?.map((w, i) => <p key={i} className="ld-why">{w}</p>)}
      {panel.actions && panel.actions.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{panel.actions.map((a, i) => <Link key={i} to={a.to} onClick={onClose} className={`ld-btn ${i ? "ghost" : ""}`} style={{ textDecoration: "none" }}>{a.label}</Link>)}</div>}
      {panel.link && <Link to={panel.link.to} onClick={onClose}>{panel.link.label} →</Link>}
    </>
  );
  return (
    <>
      <div className="ld-back" onClick={onClose} />
      <aside className={`ld-panel ${sheet ? "sheet" : ""}`} role="dialog" aria-label={panel.title}>
        {sheet && <div className="ld-grab" />}
        <div className="ld-ph">
          {m ? <PixelAvatar seed={m.seed} palette={m.pal} size={36} /> : <BaniOrb size={36} mode="idle" />}
          <h3>{panel.title}</h3>
          <button className="ld-ic" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ld-pb">{body}</div>
        <div className="ld-pf"><Composer placeholder="Reply to Bani" onSend={(t) => onAsk(t ? `${panel.title}: ${t}` : `Tell me more about ${panel.title}`)} /></div>
      </aside>
    </>
  );
}
