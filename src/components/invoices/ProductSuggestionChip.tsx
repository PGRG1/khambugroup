import React, { useState } from "react";
import { Sparkles, Check, ChevronDown } from "lucide-react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { Button } from "@/components/ui/button";
import type { FuzzyCandidate } from "@/utils/productFuzzyMatch";
import { formatCurrency } from "@/utils/format";

interface Props {
  candidates: FuzzyCandidate[];
  onApply: (c: FuzzyCandidate) => void;
  onAskAi?: () => void;
  aiLoading?: boolean;
  source?: "local" | "ai";
  /** Linked lines: render as a compact "Change match" override picker. */
  mode?: "suggest" | "change";
  /** Product master id currently linked, so it can be excluded from the list. */
  linkedProductId?: string | null;
}

/**
 * "Did you mean …?" inline chip shown under an unmatched invoice line.
 * Purely a suggestion — nothing is linked until the user presses Apply.
 */
export default function ProductSuggestionChip({ candidates, onApply, onAskAi, aiLoading, source = "local", mode = "suggest", linkedProductId }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (mode === "change") {
    const others = candidates.filter((c) => c.entry.id !== linkedProductId);
    if (!others.length) return null;
    const labelOf = (c: FuzzyCandidate) =>
      c.entry.supplier_product_name || c.entry.internal_product_name || c.entry.internal_sku;
    return (
      <div className="mt-1 space-y-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-[10px] font-medium leading-4 text-muted-foreground hover:text-foreground"
          title="Pick a different product from the other candidates"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          Change match ({others.length})
        </button>
        {expanded && (
          <div className="flex flex-wrap gap-1">
            {others.map((c, idx) => (
              <Button
                key={idx}
                size="sm"
                variant="outline"
                className="h-6 px-1.5 py-0.5 text-[10px] font-medium leading-4"
                title={c.reasons.join(", ")}
                onClick={() => onApply(c)}
              >
                {labelOf(c)} <span className="ml-1 font-mono opacity-60">{Math.round((c.confidence ?? c.rawNameScore) * 100)}%</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!candidates.length) {
    if (!onAskAi) return null;
    return (
      <button
        type="button"
        onClick={onAskAi}
        disabled={aiLoading}
        className="mt-1 inline-flex h-6 items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary hover:underline disabled:opacity-60"
      >
        {aiLoading ? <BaniProcessingMark size={14} /> : <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center"><Sparkles className="h-3 w-3" /></span>}
        Ask AI to match
      </button>
    );
  }


  const label = (c: FuzzyCandidate) =>
    c.entry.internal_product_name || c.entry.supplier_product_name || c.entry.internal_sku;
  const confidence = (c: FuzzyCandidate) => c.confidence ?? c.rawNameScore;
  const detail = (c: FuzzyCandidate) => {
    const bits: string[] = [];
    if (c.entry.supplier_product_name && c.entry.supplier_product_name !== label(c)) bits.push(c.entry.supplier_product_name);
    if (c.entry.purchase_unit) bits.push(c.entry.purchase_unit);
    if (c.entry.purchase_unit_cost != null && Number.isFinite(Number(c.entry.purchase_unit_cost))) bits.push(formatCurrency(Number(c.entry.purchase_unit_cost)));
    return bits.join(" · ");
  };

  return (
    <div className="mt-1.5 space-y-1 rounded-md border border-primary/20 bg-primary/5 p-1.5">
      <div className="flex items-center gap-1 text-[10px] font-medium leading-4 text-muted-foreground">
        {source === "ai" ? <Sparkles className="h-3 w-3 text-primary" /> : null}
        <span>{source === "ai" ? "Bani found likely items — pick one" : "Possible items — pick one"}</span>
        {onAskAi && (
          <button type="button" onClick={onAskAi} disabled={aiLoading} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60">
            {aiLoading ? <BaniProcessingMark size={14} /> : null}
            {source === "ai" ? "Look again" : "Ask Bani"}
          </button>
        )}
      </div>
      {candidates.map((c, idx) => (
        <button
          key={c.entry.supplier_entry_id || `${c.entry.id}-${idx}`}
          type="button"
          onClick={() => onApply(c)}
          className="flex w-full items-start gap-2 rounded border border-transparent bg-background/80 px-1.5 py-1 text-left hover:border-primary/40"
        >
          <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium text-foreground">
              {label(c)} <span className="td-num font-normal text-muted-foreground">{Math.round(confidence(c) * 100)}%</span>
            </span>
            {detail(c) && <span className="block truncate text-[10px] text-muted-foreground">{detail(c)}</span>}
            {c.reasons[0] && <span className="block text-[10px] text-muted-foreground">{c.reasons[0]}</span>}
            {c.blockingReasons[0] && <span className="block text-[10px] text-warning">{c.blockingReasons[0]}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
