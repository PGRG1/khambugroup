import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from './useActiveTenant';
import { useAuth } from './useAuth';
import { usePreviewMode } from './usePreviewMode';
import type { SettingsDestination } from '@/utils/settingsNavigation';

export type SettingsFact = { value?: string; sub?: string; amber?: boolean };

const count = async (table: string, tenantId: string, extra?: (q: any) => any) => {
  let q: any = (supabase.from(table as any) as any).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (extra) q = extra(q);
  const { count: n } = await q;
  return n ?? 0;
};
const config = (rows: { key: string; value: unknown }[], key: string) => { const v = rows.find(r => r.key === key)?.value; return typeof v === 'string' ? v.replace(/^"|"$/g, '') : v == null ? null : String(v); };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** One light read for the Settings overview: each row's current value and anything missing. Counts only, never full lists. */
export function useSettingsSummary(enabled: boolean) {
  const { tenantId } = useActiveTenant(), { user } = useAuth(), preview = usePreviewMode();
  return useQuery({
    queryKey: ['settings-summary', user?.id, tenantId, preview.previewUserId],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<Partial<Record<SettingsDestination, SettingsFact>>> => {
      const t = tenantId!;
      const [orgs, venues, sources, members, cfg, processors, rates, opening, suppliers, products, noCategory, people] = await Promise.all([
        supabase.from('organizations').select('name,registration_number').eq('tenant_id', t),
        supabase.from('venues').select('name,is_active,seats').eq('tenant_id', t),
        count('revenue_sources', t, q => q.eq('is_active', true)),
        count('tenant_members', t),
        supabase.from('app_config').select('key,value').eq('tenant_id', t).in('key', ['purchasing_mode', 'stock_count_reference_mode', 'books_start_date']),
        supabase.from('payment_processors').select('id,name,is_active').eq('tenant_id', t),
        supabase.from('payment_processor_fee_rates').select('processor_id').eq('tenant_id', t),
        count('account_opening_balances', t),
        count('suppliers', t),
        count('product_master', t),
        count('product_master', t, q => q.is('level1_category', null)),
        supabase.from('people_settings' as any).select('values').eq('tenant_id', t).is('venue_id', null).maybeSingle(),
      ]);
      const o = (orgs.data ?? []) as { name: string; registration_number: string | null }[];
      const v = (venues.data ?? []) as { name: string; is_active: boolean; seats: number | null }[];
      const open = v.filter(x => x.is_active), noSeats = open.filter(x => !x.seats);
      const c = (cfg.data ?? []) as { key: string; value: unknown }[];
      const p = ((processors.data ?? []) as { id: string; name: string; is_active: boolean }[]).filter(x => x.is_active !== false);
      const rated = new Set(((rates.data ?? []) as { processor_id: string }[]).map(r => r.processor_id)), noRate = p.filter(x => !rated.has(x.id));
      const books = config(c, 'books_start_date'), buy = config(c, 'purchasing_mode'), stock = config(c, 'stock_count_reference_mode');
      const approvals = ((people.data as { values?: { approvals?: string } } | null)?.values?.approvals) ?? 'owner_run';
      return {
        company: !o.length ? { value: 'Not set', sub: 'No company details yet', amber: true } : { value: o[0].name, sub: o.some(x => !x.registration_number) ? 'Registration number not recorded' : 'Registered details recorded', amber: o.some(x => !x.registration_number) },
        venues: { value: `${open.length} open${v.length > open.length ? ` · ${v.length - open.length} closed` : ''}`, sub: noSeats.length ? `${noSeats.map(x => x.name).join(', ')} ${noSeats.length === 1 ? 'has' : 'have'} no seats set` : 'Seats, service periods and closures', amber: noSeats.length > 0 },
        sources: { value: String(sources), sub: 'Restaurant, events, delivery and more' },
        users: { value: `${members} ${members === 1 ? 'person' : 'people'}`, sub: 'What each person can see and change' },
        approvals: { value: approvals === 'owner_run' ? 'Owner-run' : approvals === 'managed' ? 'Managed' : 'Strict' },
        purchasing: { value: buy === 'central' ? 'Central' : 'By venue' },
        stock: { value: stock === 'none' ? 'Blind count' : 'Last approved count' },
        books: books ? { value: day(books), sub: 'The first day your books cover' } : { value: 'Automatic', sub: 'From your first entry' },
        processors: { value: String(p.length), sub: noRate.length ? `${noRate.map(x => x.name).join(', ')} ${noRate.length === 1 ? 'has' : 'have'} no fee rate` : p.length ? 'Fee rates set' : 'No card processors yet', amber: noRate.length > 0 },
        opening: { value: opening ? 'Recorded' : 'None yet' },
        suppliers: { value: String(suppliers) },
        products: { value: String(products), sub: noCategory ? `${noCategory} with no category` : undefined, amber: noCategory > 0 },
      };
    },
  });
}
