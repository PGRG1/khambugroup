import React, { useState } from "react";
import { Sparkles, Check, ChevronDown, Loader2 } from "lucide-react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { Button } from "@/components/ui/button";
import type { FuzzyCandidate } from "@/utils/productFuzzyMatch";

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
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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
                className="h-6 px-2 text-[11px]"
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
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-60"
      >
        {aiLoading ? <BaniProcessingMark size={14} /> : <Sparkles className="h-3 w-3" />}
        Ask AI to match
      </button>
    );
  }


  const top = candidates[0];
  const rest = candidates.slice(1);
  const label = (c: FuzzyCandidate) =>
    c.entry.supplier_product_name || c.entry.internal_product_name || c.entry.internal_sku;
  const confidence = (c: FuzzyCandidate) => c.confidence ?? c.rawNameScore;

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-muted-foreground">Did you mean</span>
        <button
          type="button"
          onClick={() => onApply(top)}
          title={`Link and use the master name "${label(top)}" — ${top.reasons.join(", ")}`}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
        >
          <Check className="h-3 w-3" />
          {label(top)}
          <span className="font-mono opacity-70">{Math.round(confidence(top) * 100)}%</span>
        </button>
        <span className="text-muted-foreground">use master name</span>
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
            title="Other candidates"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
        {source === "ai" && <span className="chip chip-info"><span /> AI</span>}
        {top.blockingReasons[0] && <span className="text-warning">{top.blockingReasons[0]}</span>}
        {onAskAi && (
          <button
            type="button"
            onClick={onAskAi}
            disabled={aiLoading}
            className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60"
          >
            {aiLoading ? <BaniProcessingMark size={14} /> : <Sparkles className="h-3 w-3" />}
            Ask AI
          </button>
        )}
      </div>

      {expanded && rest.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rest.map((c, idx) => (
            <Button
              key={idx}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              title={c.reasons.join(", ")}
              onClick={() => onApply(c)}
            >
              {label(c)} <span className="ml-1 font-mono opacity-60">{Math.round(confidence(c) * 100)}%</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
