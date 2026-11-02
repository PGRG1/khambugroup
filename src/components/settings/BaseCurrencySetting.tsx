import { useQueryClient } from '@tanstack/react-query';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useBaseCurrency } from '@/hooks/useFxRate';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const CODES = (() => { try { return (Intl as any).supportedValuesOf('currency') as string[]; } catch { return ['HKD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'AUD']; } })();

/** One base currency per business; locked once any journal is posted (server-enforced). */
export function BaseCurrencySetting() {
  const q = useBaseCurrency(), { tenantId } = useActiveTenant(), cache = useQueryClient(), preview = usePreviewMode();
  const locked = !!q.data?.locked;
  return <div className="flex flex-wrap justify-between gap-3 items-center">
    <div><Label>Base currency</Label><p className="text-xs text-muted-foreground">{locked ? 'Locked — the books already have posted entries.' : 'Set once. It locks when the first entry is posted.'}</p></div>
    <Select disabled={locked || preview.isPreviewActive || q.isPending || !tenantId} value={q.data?.base ?? 'HKD'} onValueChange={async value => {
      if (!tenantId) return;
      const { error } = await supabase.rpc('set_base_currency', { p_tenant: tenantId, p_currency: value });
      if (error) toast.error(error.message); else { toast.success(`Base currency set to ${value}`); await cache.invalidateQueries({ queryKey: ['base-currency'] }); }
    }}>
      <SelectTrigger className="w-44" aria-label="Base currency"><SelectValue /></SelectTrigger>
      <SelectContent>{CODES.filter(Boolean).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}
