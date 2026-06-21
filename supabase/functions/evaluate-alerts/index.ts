// supabase/functions/evaluate-alerts/index.ts
// Computes today's KPIs, fires push notifications for rules that breach thresholds,
// and sends an optional "Daily Business Pulse" summary.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fmtHKD(n: number) {
  return `HK$ ${Math.round(n).toLocaleString("en-US")}`;
}

function todayHKT() {
  const now = new Date();
  // HKT = UTC+8
  const hk = new Date(now.getTime() + 8 * 3600 * 1000);
  return hk.toISOString().slice(0, 10);
}

function monthStartHKT(d: string) {
  return d.slice(0, 7) + "-01";
}

const METRIC_LABELS: Record<string, string> = {
  mtd_revenue: "MTD Revenue",
  mtd_cogs: "MTD COGS",
  mtd_cogs_ratio: "MTD COGS %",
  mtd_labour_ratio: "MTD Labour %",
  today_revenue: "Today Revenue",
  today_covers: "Today Covers",
  mtd_revenue_vs_goal_pct: "MTD Revenue vs Goal %",
};

function isPct(metric: string) {
  return metric.endsWith("_ratio") || metric.endsWith("_pct");
}
function isMoney(metric: string) {
  return ["mtd_revenue", "mtd_cogs", "today_revenue"].includes(metric);
}
function fmtValue(metric: string, v: number) {
  if (isPct(metric)) return `${v.toFixed(1)}%`;
  if (isMoney(metric)) return fmtHKD(v);
  return Math.round(v).toLocaleString("en-US");
}

function opCheck(op: string, value: number, threshold: number) {
  switch (op) {
    case "lt": return value < threshold;
    case "lte": return value <= threshold;
    case "gt": return value > threshold;
    case "gte": return value >= threshold;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const today = todayHKT();
    const monthStart = monthStartHKT(today);

    // Iterate every active tenant. Each tenant evaluates its own rules/alerts.
    const { data: tenants } = await admin.from("tenants").select("id, name").eq("status", "active");
    const tenantList = (tenants && tenants.length > 0) ? tenants : [{ id: "00000000-0000-0000-0000-00000000beef", name: "KHAMBU" }];

    let totalFired = 0;
    let totalPulseSent = 0;
    const perTenant: Array<Record<string, unknown>> = [];

    for (const tenantRow of tenantList) {
      const tenantId = String(tenantRow.id);

    // ---- Aggregate MTD sales per venue ----
    const { data: sales } = await admin
      .from("sales_records")
      .select("date,venue,subtotal,service_charge,discount,guests")
      .eq("tenant_id", tenantId)
      .gte("date", monthStart)
      .lte("date", today);

    const mtdByVenue = new Map<string, { revenue: number; covers: number }>();
    const todayByVenue = new Map<string, { revenue: number; covers: number }>();
    let mtdRevenueAll = 0, todayRevenueAll = 0, todayCoversAll = 0;

    for (const r of sales || []) {
      const rev = (Number(r.subtotal) || 0) + (Number(r.service_charge) || 0) + (Number(r.discount) || 0);
      const venue = r.venue || "(unknown)";
      const cur = mtdByVenue.get(venue) || { revenue: 0, covers: 0 };
      cur.revenue += rev; cur.covers += Number(r.guests) || 0;
      mtdByVenue.set(venue, cur);
      mtdRevenueAll += rev;
      if (r.date === today) {
        const t = todayByVenue.get(venue) || { revenue: 0, covers: 0 };
        t.revenue += rev; t.covers += Number(r.guests) || 0;
        todayByVenue.set(venue, t);
        todayRevenueAll += rev; todayCoversAll += Number(r.guests) || 0;
      }
    }

    // ---- MTD COGS per venue (sum invoice totals where treatment is COGS) ----
    const { data: invs } = await admin
      .from("invoices")
      .select("invoice_date,venue,total_amount,status")
      .eq("tenant_id", tenantId)
      .gte("invoice_date", monthStart)
      .lte("invoice_date", today)
      .in("status", ["paid", "unpaid"]);
    const cogsByVenue = new Map<string, number>();
    let cogsAll = 0;
    for (const i of invs || []) {
      const venue = i.venue || "(unknown)";
      const amt = Number(i.total_amount) || 0;
      cogsByVenue.set(venue, (cogsByVenue.get(venue) || 0) + amt);
      cogsAll += amt;
    }

    // ---- MTD goals (sum revenue_targets for this month per venue) ----
    const { data: targets } = await admin
      .from("revenue_targets")
      .select("year,month,target_amount,venues")
      .eq("tenant_id", tenantId);
    const yyyy = Number(today.slice(0, 4));
    const mm = Number(today.slice(5, 7));
    const goalByVenue = new Map<string, number>();
    let goalAll = 0;
    for (const t of targets || []) {
      if (Number(t.year) === yyyy && Number(t.month) === mm) {
        const amt = Number(t.target_amount) || 0;
        const vs = Array.isArray(t.venues) ? t.venues : [];
        if (vs.length === 0) { goalAll += amt; }
        else {
          for (const v of vs) goalByVenue.set(String(v), (goalByVenue.get(String(v)) || 0) + amt / vs.length);
          goalAll += amt;
        }
      }
    }

    function getMetric(metric: string, venue: string | null): number | null {
      const allKey = venue || null;
      const mtdRev = allKey ? (mtdByVenue.get(allKey)?.revenue || 0) : mtdRevenueAll;
      const todayRev = allKey ? (todayByVenue.get(allKey)?.revenue || 0) : todayRevenueAll;
      const todayCov = allKey ? (todayByVenue.get(allKey)?.covers || 0) : todayCoversAll;
      const cogs = allKey ? (cogsByVenue.get(allKey) || 0) : cogsAll;
      const goal = allKey ? (goalByVenue.get(allKey) || 0) : goalAll;
      switch (metric) {
        case "mtd_revenue": return mtdRev;
        case "today_revenue": return todayRev;
        case "today_covers": return todayCov;
        case "mtd_cogs": return cogs;
        case "mtd_cogs_ratio": return mtdRev > 0 ? (cogs / mtdRev) * 100 : 0;
        case "mtd_revenue_vs_goal_pct": return goal > 0 ? (mtdRev / goal) * 100 : 0;
        case "mtd_labour_ratio": return 0; // labour not wired in yet
      }
      return null;
    }

    // ---- Evaluate rules ----
    const { data: rules } = await admin.from("alert_rules").select("*").eq("enabled", true);
    const { data: roleRows } = await admin.from("user_roles").select("user_id,role");
    const rolesByUser = new Map<string, Set<string>>();
    for (const r of roleRows || []) {
      const s = rolesByUser.get(r.user_id) || new Set();
      s.add(String(r.role));
      rolesByUser.set(r.user_id, s);
    }

    const sendPushUrl = `${SUPABASE_URL}/functions/v1/send-push`;
    async function sendToUserIds(userIds: string[], payload: Record<string, unknown>) {
      if (!userIds.length) return 0;
      const res = await fetch(sendPushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ user_ids: userIds, payload }),
      });
      const j = await res.json().catch(() => ({}));
      return Number(j.sent || 0);
    }

    let fired = 0;
    for (const rule of rules || []) {
      const val = getMetric(String(rule.metric), rule.venue);
      if (val === null) continue;
      const breached = opCheck(String(rule.operator), val, Number(rule.threshold));
      if (!breached) continue;

      // dedupe: skip if event already exists for today
      const { data: existing } = await admin
        .from("alert_events").select("id").eq("rule_id", rule.id).eq("fired_for_date", today).maybeSingle();
      if (existing) continue;

      // audience
      const audience = (rule.audience_roles as string[]) || [];
      const targetUsers: string[] = [];
      rolesByUser.forEach((roles, uid) => {
        if (audience.some((r) => roles.has(r))) targetUsers.push(uid);
      });
      // Also include rule owner if personal rule
      if (rule.user_id && !targetUsers.includes(rule.user_id)) targetUsers.push(rule.user_id);

      const opLabel = { lt: "below", lte: "≤", gt: "above", gte: "≥" }[String(rule.operator)] || String(rule.operator);
      const metricLbl = METRIC_LABELS[String(rule.metric)] || String(rule.metric);
      const venueLbl = rule.venue ? ` (${rule.venue})` : "";
      const title = `${rule.severity === "critical" ? "🚨" : rule.severity === "warning" ? "⚠️" : "ℹ️"} ${rule.name}`;
      const bodyTxt = `${metricLbl}${venueLbl} is ${fmtValue(String(rule.metric), val)} — ${opLabel} ${fmtValue(String(rule.metric), Number(rule.threshold))}`;

      const sent = await sendToUserIds(targetUsers, {
        title, body: bodyTxt, url: "/notifications",
        tag: `rule-${rule.id}`,
        requireInteraction: rule.severity === "critical",
      });

      await admin.from("alert_events").insert({
        rule_id: rule.id,
        fired_for_date: today,
        metric_value: val,
        threshold: Number(rule.threshold),
        severity: rule.severity,
        payload: { title, body: bodyTxt },
        sent_count: sent,
      });
      fired++;
    }

    // ---- Daily Business Pulse to every subscribed user (toggle per device) ----
    const { data: pulseSubs } = await admin
      .from("push_subscriptions")
      .select("id,user_id")
      .eq("enabled_daily_pulse", true);
    const pulseUserIds = Array.from(new Set((pulseSubs || []).map((s) => s.user_id)));

    const goalPct = goalAll > 0 ? (mtdRevenueAll / goalAll) * 100 : 0;
    const pulseBody = `MTD Revenue ${fmtHKD(mtdRevenueAll)}${goalAll > 0 ? ` (${goalPct.toFixed(0)}% of goal)` : ""} · MTD COGS ${fmtHKD(cogsAll)} · Today ${fmtHKD(todayRevenueAll)}`;
    let pulseSent = 0;
    if (pulseUserIds.length) {
      pulseSent = await sendToUserIds(pulseUserIds, {
        title: "Daily Business Pulse",
        body: pulseBody,
        url: "/",
        tag: `pulse-${today}`,
      });
    }

    return new Response(
      JSON.stringify({ today, mtd_revenue: mtdRevenueAll, mtd_cogs: cogsAll, mtd_goal: goalAll, today_revenue: todayRevenueAll, rules_fired: fired, pulse_sent: pulseSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("evaluate-alerts error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
