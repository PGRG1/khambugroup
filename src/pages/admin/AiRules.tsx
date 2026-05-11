import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Sparkles, Filter, History, ShieldCheck } from "lucide-react";

type Rule = {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  domain: string;
  workflow: string;
  rule_type: string | null;
  name: string | null;
  input_pattern: any;
  output_action: any;
  confidence: number;
  hit_count: number;
  last_used_at: string | null;
  status: "active" | "disabled" | "needs_review";
  version: number;
  created_at: string;
  updated_at: string;
};

const DOMAINS = ["bank_recon", "settlement", "finance", "procurement", "sales", "documents", "inventory"] as const;
const STATUSES = ["active", "disabled", "needs_review"] as const;

function statusChip(s: Rule["status"]) {
  const cls = s === "active" ? "chip-success" : s === "disabled" ? "chip-neutral" : "chip-warn";
  return (
    <span className={`chip ${cls}`}>
      <span /> {s.replace("_", " ")}
    </span>
  );
}

function summarisePattern(p: any) {
  if (!p || typeof p !== "object") return "—";
  const entries = Object.entries(p).slice(0, 3);
  return entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") || "—";
}

function summariseAction(a: any) {
  if (!a || typeof a !== "object") return "—";
  const keys = ["suggested_type", "suggested_category", "account", "category", "product_id"];
  for (const k of keys) if (a[k]) return `${k}: ${a[k]}`;
  return Object.keys(a).slice(0, 2).join(", ") || "—";
}

export default function AiRules() {
  const { user, loading } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(true);
  const [tab, setTab] = useState<"all" | "review" | "history">("all");

  // Filters
  const [fDomain, setFDomain] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fWorkflow, setFWorkflow] = useState<string>("");
  const [fSearch, setFSearch] = useState<string>("");
  const [fMinHits, setFMinHits] = useState<string>("");

  const [drawer, setDrawer] = useState<Rule | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      const data = await fetchAllRows("ai_learned_rules", "*", { col: "updated_at", asc: false });
      setRules(data as Rule[]);
    } catch (e: any) {
      toast.error(`Failed to load rules: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const workflows = useMemo(() => Array.from(new Set(rules.map((r) => r.workflow))).sort(), [rules]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (tab === "review" && r.status !== "needs_review") return false;
      if (fDomain !== "all" && r.domain !== fDomain) return false;
      if (fStatus !== "all" && r.status !== fStatus) return false;
      if (fWorkflow && r.workflow !== fWorkflow) return false;
      if (fMinHits && r.hit_count < Number(fMinHits)) return false;
      if (fSearch) {
        const hay = JSON.stringify({ p: r.input_pattern, o: r.output_action, n: r.name }).toLowerCase();
        if (!hay.includes(fSearch.toLowerCase())) return false;
      }
      return true;
    });
  }, [rules, tab, fDomain, fStatus, fWorkflow, fMinHits, fSearch]);

  const updateRule = async (id: string, patch: Partial<Rule>) => {
    const { error } = await supabase.from("ai_learned_rules").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rule updated");
    await load();
    if (drawer?.id === id) setDrawer({ ...drawer, ...patch } as Rule);
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Permanently delete this rule? Disabling is usually safer.")) return;
    const { error } = await supabase.from("ai_learned_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rule deleted");
    setDrawer(null);
    await load();
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI Learned Rules
          </h1>
          <p className="text-sm text-muted-foreground">
            Everything the AI has learned across Bank Recon, Settlements, Procurement, Sales and Documents — review,
            edit, disable, or delete.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setTab("all")}
            className={`px-3 py-1.5 rounded-md border ${tab === "all" ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            All ({rules.length})
          </button>
          <button
            onClick={() => setTab("review")}
            className={`px-3 py-1.5 rounded-md border flex items-center gap-1 ${tab === "review" ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Approval queue (
            {rules.filter((r) => r.status === "needs_review").length})
          </button>
        </div>
      </header>

      <div className="card-glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Select value={fDomain} onValueChange={setFDomain}>
            <SelectTrigger><SelectValue placeholder="Domain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fWorkflow || "all"} onValueChange={(v) => setFWorkflow(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Workflow" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workflows</SelectItem>
              {workflows.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Min hits" type="number" value={fMinHits} onChange={(e) => setFMinHits(e.target.value)} />
          <Input
            className="md:col-span-2"
            placeholder="Search input/output/name…"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card-glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Domain</th>
              <th className="text-left p-2">Workflow</th>
              <th className="text-left p-2">Trigger</th>
              <th className="text-left p-2">Action</th>
              <th className="text-right p-2 td-num">Conf.</th>
              <th className="text-right p-2 td-num">Hits</th>
              <th className="text-left p-2">Last used</th>
              <th className="text-left p-2">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No rules match.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20 cursor-pointer"
                    onClick={() => setDrawer(r)}>
                  <td className="p-2">{r.domain}</td>
                  <td className="p-2 text-muted-foreground">{r.workflow}</td>
                  <td className="p-2 max-w-xs truncate" title={summarisePattern(r.input_pattern)}>
                    {summarisePattern(r.input_pattern)}
                  </td>
                  <td className="p-2 max-w-xs truncate" title={summariseAction(r.output_action)}>
                    {summariseAction(r.output_action)}
                  </td>
                  <td className="p-2 text-right td-num">{Math.round(r.confidence * 100)}%</td>
                  <td className="p-2 text-right td-num">{r.hit_count}</td>
                  <td className="p-2 text-muted-foreground">
                    {r.last_used_at ? new Date(r.last_used_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-2">{statusChip(r.status)}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRule(r.id, { status: r.status === "active" ? "disabled" : "active" });
                      }}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      {r.status === "active" ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          {drawer && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Rule details
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">Domain</div><div>{drawer.domain}</div></div>
                  <div><div className="text-xs text-muted-foreground">Workflow</div><div>{drawer.workflow}</div></div>
                  <div><div className="text-xs text-muted-foreground">Hits</div><div className="td-num">{drawer.hit_count}</div></div>
                  <div><div className="text-xs text-muted-foreground">Confidence</div><div className="td-num">{Math.round(drawer.confidence * 100)}%</div></div>
                  <div><div className="text-xs text-muted-foreground">Version</div><div className="td-num">v{drawer.version}</div></div>
                  <div><div className="text-xs text-muted-foreground">Status</div><div>{statusChip(drawer.status)}</div></div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Input pattern (trigger)</div>
                  <pre className="bg-muted/30 p-2 rounded text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(drawer.input_pattern, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Output action</div>
                  <pre className="bg-muted/30 p-2 rounded text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(drawer.output_action, null, 2)}
                  </pre>
                </div>

                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <Select
                    value={drawer.status}
                    onValueChange={(v) => updateRule(drawer.id, { status: v as Rule["status"] })}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => updateRule(drawer.id, { status: "needs_review" })}>
                    Mark Needs Review
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteRule(drawer.id)}>
                    Delete
                  </Button>
                </div>

                <div className="border-t border-border pt-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <History className="h-3.5 w-3.5" /> Audit trail
                  </div>
                  <RuleHistory ruleId={drawer.id} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RuleHistory({ ruleId }: { ruleId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("ai_learned_rules_history")
        .select("change_type, changed_at, changed_by")
        .eq("rule_id", ruleId)
        .order("changed_at", { ascending: false })
        .limit(20);
      setRows(data ?? []);
    })();
  }, [ruleId]);
  if (!rows.length) return <div className="text-xs text-muted-foreground">No history yet.</div>;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {rows.map((r, i) => (
        <li key={i} className="flex justify-between">
          <span>{r.change_type}</span>
          <span>{new Date(r.changed_at).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
