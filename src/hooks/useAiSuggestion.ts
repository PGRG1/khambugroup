import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AiDomain =
  | "bank_recon"
  | "settlement"
  | "finance"
  | "procurement"
  | "sales"
  | "documents"
  | "inventory";

export interface AiSuggestion {
  suggestion: Record<string, any>;
  rule_pattern: Record<string, any> | null;
  confidence: number;
  rationale: string;
}

interface UseAiSuggestionParams {
  domain: AiDomain;
  workflow: string;
  input: Record<string, any> | null;
  venueId?: string | null;
  recordType?: string;
  recordId?: string;
}

/**
 * Shared hook for the cross-domain AI learning loop.
 * Fetches a suggestion (Accept Once / Accept & Teach), then records the user's decision
 * via the ai-classify edge function.
 */
export function useAiSuggestion(params: UseAiSuggestionParams) {
  const { domain, workflow, input, venueId, recordType, recordId } = params;
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleError = (e: any) => {
    const msg = e?.message || String(e);
    if (msg.includes("rate_limited")) toast.error("AI rate limit reached, try again shortly.");
    else if (msg.includes("payment_required"))
      toast.error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
    else toast.error(`AI error: ${msg}`);
  };

  const fetchSuggestion = useCallback(async () => {
    if (!input) return;
    setIsLoading(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-classify", {
        body: { op: "suggest", domain, workflow, input, venue_id: venueId ?? null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSuggestion(data as AiSuggestion);
    } catch (e) {
      handleError(e);
    } finally {
      setIsLoading(false);
    }
  }, [domain, workflow, input, venueId]);

  const apply = useCallback(
    async (teach: boolean, overrides?: { output_action?: any; rule_pattern?: any; was_overridden?: boolean }) => {
      if (!suggestion && !overrides?.output_action) return;
      try {
        const output_action = overrides?.output_action ?? suggestion!.suggestion;
        const rule_pattern = overrides?.rule_pattern ?? suggestion?.rule_pattern;
        const { data, error } = await supabase.functions.invoke("ai-classify", {
          body: {
            op: "apply",
            domain,
            workflow,
            input,
            output_action,
            rule_pattern,
            confidence: suggestion?.confidence ?? 0.85,
            teach,
            record_type: recordType,
            record_id: recordId,
            venue_id: venueId ?? null,
            was_overridden: overrides?.was_overridden ?? false,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success(teach ? "Accepted & taught — the AI will remember this." : "Accepted.");
        return data as { ok: true; rule_id: string | null };
      } catch (e) {
        handleError(e);
      }
    },
    [domain, workflow, input, suggestion, recordType, recordId, venueId]
  );

  return {
    suggestion,
    isLoading,
    fetchSuggestion,
    acceptOnce: () => apply(false),
    acceptAndTeach: () => apply(true),
  };
}
