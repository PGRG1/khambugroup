import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export type FxLookup = { rate: number; rate_date: string; source: string; nearest: boolean } | null;

/** rate(date, currency) → base units per 1 unit, falling back to the nearest previous date (flagged). */
export async function lookupFxRate(tenantId: string, date: string, currency: string): Promise<FxLookup> {
  const { data, error } = await supabase.rpc('fx_rate', { p_tenant: tenantId, p_date: date.slice(0, 10), p_currency: currency });
  if (error) throw error;
  const row = (data as any[])?.[0];
  return row ? { rate: Number(row.rate), rate_date: row.rate_date, source: row.source, nearest: !!row.nearest } : null;
}

export function useFxRate(date: string | null | undefined, currency: string | null | undefined) {
  const { tenantId } = useActiveTenant();
  return useQuery({
    queryKey: ['fx-rate', tenantId, date, currency],
    enabled: !!tenantId && !!date && !!currency,
    queryFn: () => { if (!tenantId || !date || !currency) throw new Error('Choose a currency and date'); return lookupFxRate(tenantId, date, currency); },
    staleTime: 3600_000,
  });
}

/** Last available rate on or before the end of a YYYY-MM month. */
export const monthEndDate = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

export function useBaseCurrency() {
  const { tenantId } = useActiveTenant();
  return useQuery({
    queryKey: ['base-currency', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) throw new Error('Choose a business');
      const [{ data, error }, posted] = await Promise.all([
        supabase.from('tenants').select('base_currency').eq('id', tenantId).maybeSingle(),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'posted'),
      ]);
      if (error) throw error;
      return { base: (data?.base_currency as string) || 'HKD', locked: (posted.count ?? 0) > 0 };
    },
    staleTime: 600_000,
  });
}
