import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useAuth } from '@/hooks/useAuth';

/** True when the active tenant has at least one staff claim (read-only head count). */
export function useExpenseClaimsExist(): boolean {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['expense-claims-exist', user?.id, tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('staff_reimbursements').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  return q.data ?? false;
}
