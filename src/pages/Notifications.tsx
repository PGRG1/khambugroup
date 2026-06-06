import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Plus, Trash2, Send } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { toast } from "@/hooks/use-toast";

const METRICS = [
  { value: "mtd_revenue", label: "MTD Revenue", unit: "HK$" },
  { value: "today_revenue", label: "Today Revenue", unit: "HK$" },
  { value: "mtd_cogs", label: "MTD COGS", unit: "HK$" },
  { value: "mtd_cogs_ratio", label: "MTD COGS %", unit: "%" },
  { value: "mtd_revenue_vs_goal_pct", label: "MTD Revenue vs Goal %", unit: "%" },
  { value: "today_covers", label: "Today Covers", unit: "" },
];
const OPS = [
  { value: "lt", label: "is below (<)" },
  { value: "lte", label: "is at most (≤)" },
  { value: "gt", label: "is above (>)" },
  { value: "gte", label: "is at least (≥)" },
];
const VENUES = ["", "Assembly", "Caliente", "Hanabi", "Events"];
const SEVERITY = ["info", "warning", "critical"] as const;

type Rule = {
  id: string; name: string; metric: string; venue: string | null;
  operator: string; threshold: number; severity: string; enabled: boolean;
  audience_roles: string[]; user_id: string | null;
};
type Event = { id: string; rule_id: string; fired_for_date: string; metric_value: number; threshold: number; severity: string; payload: any };

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status, busy, subscribe, unsubscribe, sendTest } = usePushSubscription();
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from("alert_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("alert_events").select("*").order("fired_for_date", { ascending: false }).limit(30),
    ]);
    setRules((r as any) || []);
    setEvents((e as any) || []);
  };
  useEffect(() => { load(); }, []);

  const saveRule = async () => {
    if (!editing || !editing.name || !editing.metric || !editing.operator || editing.threshold == null) {
      toast({ title: "Missing fields", variant: "destructive" }); return;
    }
    const payload: any = {
      name: editing.name,
      metric: editing.metric,
      venue: editing.venue || null,
      operator: editing.operator,
      threshold: Number(editing.threshold),
      severity: editing.severity || "warning",
      enabled: editing.enabled !== false,
      audience_roles: editing.audience_roles?.length ? editing.audience_roles : ["admin", "manager"],
    };
    if (editing.id) {
      await supabase.from("alert_rules").update(payload).eq("id", editing.id);
    } else {
      payload.user_id = user?.id;
      await supabase.from("alert_rules").insert(payload);
    }
    setEditing(null);
    load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    await supabase.from("alert_rules").delete().eq("id", id);
    load();
  };

  const toggleRule = async (r: Rule) => {
    await supabase.from("alert_rules").update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-alerts", { body: {} });
      if (error) throw error;
      toast({ title: "Evaluation complete", description: `Fired ${data?.rules_fired ?? 0} rules · Pulse sent to ${data?.pulse_sent ?? 0} devices` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  const statusBadge = {
    unsupported: <Badge variant="secondary">Not supported on this browser</Badge>,
    denied: <Badge variant="destructive">Blocked in browser settings</Badge>,
    default: <Badge variant="outline">Off</Badge>,
    ready: <Badge variant="outline">Permission granted</Badge>,
    subscribed: <Badge className="bg-emerald-600 hover:bg-emerald-600">Enabled</Badge>,
  }[status];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Business Pulse</h1>
        <p className="text-sm text-muted-foreground">Daily push notifications when your KPIs cross thresholds you define.</p>
      </div>

      {/* This device */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">This device</div>
              <div className="text-xs text-muted-foreground">Install Khambu to your home screen, then enable push.</div>
            </div>
          </div>
          {statusBadge}
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "subscribed" ? (
            <>
              <Button variant="outline" onClick={sendTest}><Send className="h-4 w-4 mr-2" />Send test</Button>
              <Button variant="ghost" onClick={unsubscribe} disabled={busy}><BellOff className="h-4 w-4 mr-2" />Disable on this device</Button>
            </>
          ) : (
            <Button onClick={subscribe} disabled={busy || status === "unsupported" || status === "denied"}>
              <Bell className="h-4 w-4 mr-2" />Enable push on this device
            </Button>
          )}
          <Button variant="outline" onClick={runNow} disabled={running}>Run evaluation now</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          iPhone: open Safari → Share → Add to Home Screen, then open the installed app to enable push.
          Cron runs daily at 21:00 HKT.
        </p>
      </Card>

      {/* Rules */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-medium">My alert rules</div>
            <div className="text-xs text-muted-foreground">Fire a push when a metric crosses your threshold.</div>
          </div>
          <Button onClick={() => setEditing({ severity: "warning", enabled: true, operator: "lt", audience_roles: ["admin","manager"] })}>
            <Plus className="h-4 w-4 mr-2" />New rule
          </Button>
        </div>
        <div className="space-y-2">
          {rules.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No rules yet. Add one to get a push when revenue or COGS hit your threshold.</div>}
          {rules.map((r) => {
            const m = METRICS.find((x) => x.value === r.metric);
            const op = OPS.find((x) => x.value === r.operator)?.label || r.operator;
            const fmt = m?.unit === "HK$" ? `HK$ ${Number(r.threshold).toLocaleString()}` : m?.unit === "%" ? `${r.threshold}%` : String(r.threshold);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 border rounded-md p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m?.label || r.metric}{r.venue ? ` · ${r.venue}` : " · All venues"} · {op} {fmt}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={r.severity === "critical" ? "destructive" : r.severity === "warning" ? "default" : "secondary"}>{r.severity}</Badge>
                  <Switch checked={r.enabled} onCheckedChange={() => toggleRule(r)} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Events */}
      <Card className="p-5">
        <div className="font-medium mb-3">Recent alerts (last 30)</div>
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No alerts have fired yet.</div>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                <div className="truncate">
                  <span className="text-muted-foreground mr-2">{e.fired_for_date}</span>
                  <span className="font-medium">{e.payload?.title || "Alert"}</span>
                  <span className="text-muted-foreground"> — {e.payload?.body || `value ${e.metric_value} vs threshold ${e.threshold}`}</span>
                </div>
                <Badge variant={e.severity === "critical" ? "destructive" : e.severity === "warning" ? "default" : "secondary"}>{e.severity}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Rule dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit rule" : "New alert rule"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. MTD Revenue below 80% of goal" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Metric</Label>
                  <Select value={editing.metric || ""} onValueChange={(v) => setEditing({ ...editing, metric: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Venue</Label>
                  <Select value={editing.venue || "__all"} onValueChange={(v) => setEditing({ ...editing, venue: v === "__all" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All venues</SelectItem>
                      {VENUES.filter(Boolean).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Condition</Label>
                  <Select value={editing.operator || "lt"} onValueChange={(v) => setEditing({ ...editing, operator: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Threshold</Label>
                  <Input type="number" value={editing.threshold ?? ""} onChange={(e) => setEditing({ ...editing, threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select value={editing.severity || "warning"} onValueChange={(v) => setEditing({ ...editing, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITY.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <Switch checked={editing.enabled !== false} onCheckedChange={(c) => setEditing({ ...editing, enabled: c })} />
                  <Label>Enabled</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveRule}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
