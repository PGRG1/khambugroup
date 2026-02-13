import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useForecastPermissions() {
  const { user, isAdmin } = useAuth();
  const [isApprover, setIsApprover] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsApprover(false);
      setIsManager(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      supabase
        .from("forecast_approvers")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["manager", "admin"]),
    ]).then(([approverRes, roleRes]) => {
      if (cancelled) return;
      setIsApprover(!approverRes.error && (approverRes.data?.length ?? 0) > 0);
      const roles = roleRes.data?.map((r) => r.role) ?? [];
      setIsManager(roles.includes("manager") || roles.includes("admin"));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user?.id]);

  // Can create forecasts
  const canCreate = isManager || isAdmin || isApprover;
  // Can approve/reject forecasts
  const canApprove = isApprover;
  // Can edit forecast figures (only if approver, or if forecast is still draft/pending)
  const canEditFigures = (status: string) => isApprover || status !== "approved";
  // Can edit general comment (anyone)
  const canEditComment = true;
  // Can edit post-event notes (submits as pending for non-approvers on approved forecasts)
  const canEditPostEventNotes = true;

  return {
    isApprover,
    isManager,
    canCreate,
    canApprove,
    canEditFigures,
    canEditComment,
    canEditPostEventNotes,
    loading,
  };
}
