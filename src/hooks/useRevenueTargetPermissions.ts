import { useForecastPermissions } from "@/hooks/useForecastPermissions";
import { useAuth } from "@/hooks/useAuth";

/**
 * Permissions for Revenue Targets v2. Mirrors the Manager/Admin gate already
 * enforced by the RPCs (generate_revenue_statistical_targets_month_v2 and
 * ensure_revenue_manager_target_lines_month).
 */
export function useRevenueTargetPermissions() {
  const { isAdmin } = useAuth();
  const { isManager, loading } = useForecastPermissions();
  const canView = true;
  const canEditManagerTargets = isAdmin || isManager;
  const canGenerateStatistical = isAdmin || isManager;
  const canApprove = isAdmin;
  return { loading, canView, canEditManagerTargets, canGenerateStatistical, canApprove };
}
