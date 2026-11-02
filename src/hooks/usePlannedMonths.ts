import { useQuery } from '@tanstack/react-query';
import { useBooksWindow } from './useBooksWindow';
import { useAuth } from './useAuth';
import { usePreviewMode } from './usePreviewMode';
import { supabase } from '@/integrations/supabase/client';
import { planningEnd } from '@/utils/periodWindow';

/** Small, tenant-scoped read: future menus reflect actual plans, never raw ledger dates. */
export function usePlannedMonths(kind: 'targets' | 'contracts') {
  const books = useBooksWindow(), { user } = useAuth(), preview = usePreviewMode();
  const query = useQuery({
    queryKey: ['planned-periods', user?.id, books.tenantId, preview.previewUserId, kind], enabled: !!books.tenantId, staleTime: 300_000,
    queryFn: async () => {
      if (!books.tenantId) return [];
      if (kind === 'targets') {
        const { data, error } = await supabase.from('revenue_daily_projections').select('target_date').eq('tenant_id', books.tenantId).order('target_date', { ascending: false }).limit(1);
        if (error) throw error;
        return (data ?? []).map(r => r.target_date.slice(0,7));
      }
      const { data, error } = await supabase.from('expense_recurring_rules').select('contract_end').eq('tenant_id', books.tenantId).eq('is_contract', true).order('contract_end', { ascending: false, nullsFirst: false }).limit(1);
      if (error) throw error;
      return (data ?? []).flatMap(r => r.contract_end ? [r.contract_end.slice(0,7)] : []);
    },
  });
  const months = query.data ?? [];
  return { ...query, months, end: planningEnd(books.today, months, kind === 'targets' ? 12 : 120) };
}