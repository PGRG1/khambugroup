import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AiSuggestion } from "@/hooks/useAiSuggestion";

interface AiSuggestionPanelProps {
  suggestion: AiSuggestion | null;
  isLoading: boolean;
  onFetch: () => void;
  onAcceptOnce: () => void;
  onAcceptAndTeach: () => void;
  renderSuggestion?: (s: AiSuggestion) => React.ReactNode;
  title?: string;
}

/**
 * Cross-domain AI suggestion panel.
 * Same UX everywhere: fetch → preview → Accept Once / Accept & Teach.
 */
export function AiSuggestionPanel({
  suggestion,
  isLoading,
  onFetch,
  onAcceptOnce,
  onAcceptAndTeach,
  renderSuggestion,
  title = "AI suggestion",
}: AiSuggestionPanelProps) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
        </div>
        {!suggestion && (
          <Button size="sm" variant="outline" onClick={onFetch} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask AI"}
          </Button>
        )}
      </div>

      {suggestion && (
        <>
          <div className="text-sm">
            {renderSuggestion ? (
              renderSuggestion(suggestion)
            ) : (
              <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                {JSON.stringify(suggestion.suggestion, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="chip chip-info">
              <span /> confidence {Math.round((suggestion.confidence ?? 0) * 100)}%
            </span>
            <div className="flex items-center gap-2">
              {suggestion.rationale && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-xs text-muted-foreground underline">Why?</button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{suggestion.rationale}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Button size="sm" variant="ghost" onClick={onAcceptOnce}>
                Accept Once
              </Button>
              <Button size="sm" onClick={onAcceptAndTeach}>
                Accept &amp; Teach
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
