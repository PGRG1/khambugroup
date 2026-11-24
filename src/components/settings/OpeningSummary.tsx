import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { shortMoney } from '@/utils/revenueOverview';
import OpeningBalances from '@/pages/procurement/OpeningBalances';
import { Row, SettingsCard } from './SettingsForm';

type Sum = { n: number; total: number };
const line = (s?: Sum) => !s ? '' : s.n ? `${shortMoney(s.total)} · ${s.n} ${s.n === 1 ? 'entry' : 'entries'}` : '';
// Settings › Books setup: opening balances read first (three lines); Edit opens the existing opening balances editor.
export function OpeningSummary() {
  const { tenantId } = useActiveTenant();
  const [sums, setSums] = useState<{ owed?: Sum; credits?: Sum; deposits?: Sum }>({});
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let on = true;
    if (!tenantId || editing) return;
    void Promise.all([
      (supabase.from('supplier_opening_balances' as any) as any).select('amount').eq('tenant_id', tenantId),
      (supabase.from('credit_notes') as any).select('remaining_balance,status').eq('tenant_id', tenantId).eq('is_opening_balance', true),
      (supabase.from('deposit_opening_balances' as any) as any).select('total_value').eq('tenant_id', tenantId),
    ]).then(([a, b, c]) => {
      if (!on) return;
      const sum = (rows: any[] | null, k: string): Sum => ({ n: rows?.length ?? 0, total: (rows ?? []).reduce((t, r) => t + Number(r[k] || 0), 0) });
      setSums({ owed: sum(a.data, 'amount'), credits: sum((b.data ?? []).filter((r: any) => r.status !== 'void'), 'remaining_balance'), deposits: sum(c.data, 'total_value') });
    });
    return () => { on = false; };
  }, [tenantId, editing]);
  if (editing) return <SettingsCard title="Opening balances" editing>
    <button type="button" className="mb-2 text-[13px] font-medium text-[#1F6B5E]" onClick={() => setEditing(false)}>Done</button>
    <OpeningBalances embedded />
  </SettingsCard>;
  return <SettingsCard title="Opening balances" onEdit={() => setEditing(true)}>
    <Row label="Owed to suppliers" value={line(sums.owed)} missing="None yet" />
    <Row label="Supplier credits" value={line(sums.credits)} missing="None yet" />
    <Row label="Deposits paid" value={line(sums.deposits)} missing="None yet" />
  </SettingsCard>;
}
