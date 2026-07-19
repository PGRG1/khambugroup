import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVenues } from "@/hooks/useVenues";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";

export type SplitLine = { venue_id: string; split_mode: "percent" | "amount"; percent: number; amount: number };
export type OwnerType = "employee" | "expense_bill";

interface Props {
  ownerType: OwnerType;
  ownerId: string | null;
  /** 'single' = whole to home venue; 'split' = manual venue split */
  mode: string | null | undefined;
  /** Base amount used to validate $ mode. Bill total or employee monthly cost. */
  baseAmount: number;
  onChange: (mode: "single" | "split", lines: SplitLine[], balanced: boolean) => void;
  className?: string;
}

/**
 * Manual per-record venue split editor. Reporting overlay only — never affects
 * journals, TB, BS, or entity-level P&L.
 */
export function VenueSplitEditor({ ownerType, ownerId, mode, baseAmount, onChange, className }: Props) {
  const { tenantId } = useActiveTenant();
  const { venues } = useVenues();
  const active = venues.filter(v => v.is_active);
  const effMode: "single" | "split" = mode === "split" ? "split" : "single";

  const [splitMode, setSplitMode] = useState<"percent" | "amount">("percent");
  const [lines, setLines] = useState<SplitLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load existing overrides
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ownerId || !tenantId) { setLines([]); setLoaded(true); return; }
      const { data } = await supabase
        .from("venue_allocation_overrides")
        .select("venue_id, split_mode, percent, amount")
        .eq("tenant_id", tenantId)
        .eq("owner_type", ownerType)
        .eq("owner_id", ownerId);
      if (cancelled) return;
      const rows = (data || []) as SplitLine[];
      if (rows.length) {
        setSplitMode(rows[0].split_mode === "amount" ? "amount" : "percent");
        setLines(rows.map(r => ({
          venue_id: r.venue_id,
          split_mode: r.split_mode,
          percent: Number(r.percent) || 0,
          amount: Number(r.amount) || 0,
        })));
      } else {
        setLines([]);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [ownerId, tenantId, ownerType]);

  // Reconciliation
  const total = lines.reduce((s, l) => s + Number(splitMode === "percent" ? l.percent : l.amount) || 0, 0);
  const target = splitMode === "percent" ? 100 : baseAmount;
  const balanced = effMode === "single"
    ? true
    : lines.length > 0 && Math.abs(total - target) < 0.01;

  // Bubble up
  useEffect(() => {
    const normalized = lines.map(l => ({ ...l, split_mode: splitMode }));
    onChange(effMode, normalized, balanced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effMode, splitMode, JSON.stringify(lines), balanced]);

  const addLine = () => {
    const used = new Set(lines.map(l => l.venue_id));
    const next = active.find(v => !used.has(v.id));
    if (!next) { toast.error("All venues already added"); return; }
    setLines([...lines, { venue_id: next.id, split_mode: splitMode, percent: 0, amount: 0 }]);
  };
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const patchLine = (i: number, patch: Partial<SplitLine>) =>
    setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Select value={effMode} onValueChange={(v) => onChange(v as "single" | "split", lines.map(l => ({ ...l, split_mode: splitMode })), v === "single" || balanced)}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Whole to primary venue</SelectItem>
            <SelectItem value="split">Split across venues</SelectItem>
          </SelectContent>
        </Select>
        {effMode === "split" && (
          <div className="inline-flex rounded-md border border-border/60 p-0.5 bg-muted/30">
            {(["percent", "amount"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setSplitMode(m)}
                className={`px-2.5 h-8 text-xs rounded ${splitMode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {m === "percent" ? "%" : "HK$"}
              </button>
            ))}
          </div>
        )}
      </div>

      {effMode === "split" && (
        <div className="mt-3 space-y-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={l.venue_id} onValueChange={(v) => patchLine(i, { venue_id: v })}>
                <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {active.map(v => (
                    <SelectItem key={v.id} value={v.id}
                      disabled={lines.some((x, xi) => xi !== i && x.venue_id === v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number" step="0.01" min="0"
                value={splitMode === "percent" ? (l.percent || "") : (l.amount || "")}
                onChange={(e) => {
                  const n = Number(e.target.value) || 0;
                  patchLine(i, splitMode === "percent" ? { percent: n } : { amount: n });
                }}
                className="w-28 h-8 text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground w-8">{splitMode === "percent" ? "%" : "HK$"}</span>
              <button type="button" onClick={() => removeLine(i)} className="p-1 rounded hover:bg-accent/20">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground/70" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
            <Plus className="h-3 w-3" /> Add venue
          </button>
          <div className={`mt-1.5 text-xs tabular-nums ${balanced ? "text-primary" : "text-destructive"}`}>
            {splitMode === "percent"
              ? `Total: ${total.toFixed(2)}% ${balanced ? "✓" : "(must equal 100)"}`
              : `Total: HK$ ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of HK$ ${baseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${balanced ? "✓" : ""}`}
            {loaded && effMode === "split" && lines.length === 0 && (
              <span className="ml-1 text-muted-foreground">— add at least one venue</span>
            )}
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground/80 inline-flex items-center gap-1">
        <Info className="h-3 w-3" />
        Reporting overlay only — never affects journals or entity P&L.
      </p>
    </div>
  );
}

/**
 * Persist manual splits for a given owner. Deletes existing rows and inserts the new ones.
 * When mode='single', simply clears the overrides.
 */
export async function saveVenueSplit(params: {
  tenantId: string;
  ownerType: OwnerType;
  ownerId: string;
  mode: "single" | "split";
  lines: SplitLine[];
  baseAmount: number;
}): Promise<boolean> {
  const { tenantId, ownerType, ownerId, mode, lines, baseAmount } = params;
  // Clear existing
  await supabase.from("venue_allocation_overrides")
    .delete().eq("tenant_id", tenantId).eq("owner_type", ownerType).eq("owner_id", ownerId);
  if (mode !== "split" || lines.length === 0) return true;

  // Validate reconciliation
  const splitMode = lines[0].split_mode;
  const total = lines.reduce((s, l) => s + (splitMode === "percent" ? Number(l.percent) : Number(l.amount)) || 0, 0);
  const target = splitMode === "percent" ? 100 : baseAmount;
  if (Math.abs(total - target) > 0.01) {
    toast.error(splitMode === "percent"
      ? `Split must sum to 100% (got ${total.toFixed(2)}%)`
      : `Split must sum to HK$ ${baseAmount.toFixed(2)} (got HK$ ${total.toFixed(2)})`);
    return false;
  }
  const { error } = await supabase.from("venue_allocation_overrides").insert(
    lines.map(l => ({
      tenant_id: tenantId,
      owner_type: ownerType,
      owner_id: ownerId,
      venue_id: l.venue_id,
      split_mode: splitMode,
      percent: splitMode === "percent" ? Number(l.percent) : 0,
      amount: splitMode === "amount" ? Number(l.amount) : 0,
    })),
  );
  if (error) { toast.error("Venue split save failed: " + error.message); return false; }
  return true;
}
