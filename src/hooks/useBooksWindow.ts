import { useQuery } from '@tanstack/react-query';
import { useActiveTenant } from './useActiveTenant';
import { useAuth } from './useAuth';
import { usePreviewMode } from './usePreviewMode';
import { supabase } from '@/integrations/supabase/client';
import { tenantToday } from '@/utils/salesRecordChecks';
export function useBooksWindow() {
  const { tenantId } = useActiveTenant(), { user } = useAuth(), preview = usePreviewMode(), today = tenantToday();
  const query = useQuery({
    queryKey: ['books-window', user?.id, tenantId, preview.previewUserId], enabled: !!tenantId, staleTime: 300_000,
    queryFn: async () => {
      if (!tenantId) throw new Error('Choose a business');
      const [config, sales, opening, tax] = await Promise.all([
        supabase.from('app_config').select('value').eq('tenant_id', tenantId).eq('key', 'books_start_date').maybeSingle(),
        supabase.from('sales_records').select('date').eq('tenant_id', tenantId).order('date').limit(1),
        supabase.from('account_opening_balances').select('as_at_date').eq('tenant_id', tenantId).order('as_at_date').limit(1),
        supabase.from('finance_schedule_settings').select('year_end_month').eq('tenant_id', tenantId).maybeSingle(),
      ]);
      for (const result of [config, sales, opening, tax]) if (result.error) throw result.error;
      const openingDate = opening.data?.[0]?.as_at_date ?? '';
      const candidates = [sales.data?.[0]?.date, openingDate].filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today).sort();
      const saved = typeof config.data?.value === 'string' ? config.data.value : undefined;
      return { start: saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : (candidates[0] ?? today).slice(0, 7) + '-01', fiscalStart: (tax.data?.year_end_month ?? 3) % 12 + 1 };
    },
  });
  return { ...query, tenantId, today, start: query.data?.start ?? today.slice(0, 7) + '-01', fiscalStart: query.data?.fiscalStart ?? 1 };
}