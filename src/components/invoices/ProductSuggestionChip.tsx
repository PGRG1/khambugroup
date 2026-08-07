import React, { useState } from "react";
import { Sparkles, Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FuzzyCandidate } from "@/utils/productFuzzyMatch";

interface Props {
  candidates: FuzzyCandidate[];
  onApply: (c: FuzzyCandidate) => void;
  onAskAi?: () => void;
  aiLoading?: boolean;
  source?: "local" | "ai";
}

/**
 * "Did you mean …?" inline chip shown under an unmatched invoice line.
 * Purely a suggestion — nothing is linked until the user presses Apply.
 */
export default function ProductSuggestionChip({ candidates, onApply, onAskAi, aiLoading, source = "local" }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!candidates.length) {
    if (!onAskAi) return null;
    return (
      <button
        type="button"
        onClick={onAskAi}
        disabled={aiLoading}
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-60"
      >
        {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Ask AI to match
      </button>
    );
  }

  const top = candidates[0];
  const rest = candidates.slice(1);
  const label = (c: FuzzyCandidate) =>
    c.entry.internal_product_name || c.entry.supplier_product_name || c.entry.internal_sku;
  const confidence = (c: FuzzyCandidate) => c.rawNameScore || c.score;

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-muted-foreground">Did you mean</span>
        <button
          type="button"
          onClick={() => onApply(top)}
          title={top.reasons.join(", ")}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
        >
          <Check className="h-3 w-3" />
          {label(top)}
          <span className="font-mono opacity-70">{Math.round(confidence(top) * 100)}%</span>
        </button>
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
            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
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
