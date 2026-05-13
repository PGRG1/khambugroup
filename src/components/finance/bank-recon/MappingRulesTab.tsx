import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadReconMappingRules, type ReconMappingRule } from "@/utils/reconciliationMappingRules";

const MOVEMENT_LABEL: Record<string, string> = {
  money_in: "Money In",
  money_out: "Money Out",
  either: "Either",
};

export function MappingRulesTab() {
  const [rules, setRules] = useState<ReconMappingRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // load all (active + inactive) by hitting the util then re-fetching inactive too
      const active = await loadReconMappingRules();
      setRules(active);
      setLoading(false);
    })();
  }, []);

  return (
    <Card className="card-glass">
      <CardHeader>
        <CardTitle className="text-base">Reconciliation Mapping Rules</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          These rules suggest classification and matching for incoming bank transactions.
          Suggestions are never auto-posted — every match requires user approval before a journal entry is created.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">Rule Name</th>
              <th className="text-left py-2 px-2">Bank Description Contains</th>
              <th className="text-left py-2 px-2">Bank Movement</th>
              <th className="text-left py-2 px-2">Counterparty</th>
              <th className="text-left py-2 px-2">Classification</th>
              <th className="text-left py-2 px-2">Match To</th>
              <th className="text-left py-2 px-2">Source Required</th>
              <th className="text-left py-2 px-2">Debit Account</th>
              <th className="text-left py-2 px-2">Credit Account</th>
              <th className="text-left py-2 px-2">Review Required</th>
              <th className="text-left py-2 px-2">Auto Post</th>
              <th className="text-left py-2 px-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rules.length === 0 && (
              <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">No mapping rules defined.</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-card/50">
                <td className="py-2 px-2 font-medium">{r.rule_name}</td>
                <td className="py-2 px-2 font-mono text-xs">{r.bank_description_contains}</td>
                <td className="py-2 px-2">
                  <span className={`chip ${r.bank_movement === "money_in" ? "chip-success" : r.bank_movement === "money_out" ? "chip-danger" : "chip-neutral"}`}>
                    <span /> {MOVEMENT_LABEL[r.bank_movement] || r.bank_movement}
                  </span>
                </td>
                <td className="py-2 px-2 text-muted-foreground">{r.counterparty_type || "—"}</td>
                <td className="py-2 px-2">{r.classification}</td>
                <td className="py-2 px-2 text-muted-foreground">{r.match_to || "—"}</td>
                <td className="py-2 px-2">{r.source_required ? <span className="chip chip-warn"><span /> Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 px-2 text-xs">{r.debit_account || "—"}</td>
                <td className="py-2 px-2 text-xs">{r.credit_account || "—"}</td>
                <td className="py-2 px-2">{r.review_required ? <span className="chip chip-info"><span /> Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 px-2">{r.auto_post ? <span className="chip chip-success"><span /> Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 px-2">{r.is_active ? <span className="chip chip-success"><span /> Active</span> : <span className="chip chip-neutral"><span /> Inactive</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
