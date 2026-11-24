import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { SettingsCard } from '@/components/settings/SettingsForm';
import { SETUP_STEPS, loadClientSetup, setupSummary, type SetupState } from '@/utils/clientSetup';

// Settings › Setup: the seven setup steps, read from the client's own data (nothing is ticked by hand). Bani's team
// (after Enter client) or the client's owner does them; each step opens the page where the work is done.

const SUPPLIER_HINT = 'Add suppliers and products in Lists, or scan invoices in Purchasing: each new product picks a master category.';

export function ClientSetup() {
  const { tenantId } = useActiveTenant();
  const { isPlatformAdmin: bani } = usePlatformAdmin();
  const [state, setState] = useState<SetupState | null>(null);
  useEffect(() => { if (tenantId) void loadClientSetup(tenantId).then(setState); }, [tenantId]);
  const s = state ? setupSummary(state) : null;
  return <SettingsCard title="Setup">
    <p className="pb-2 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{s ? `${s.done} of ${s.total} done · Bani's team or your owner can do these` : 'Loading setup…'}</p>
    {state && <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Setup steps"><table className="sales-table" aria-label="Setup steps">
      <thead><tr>{['Step', 'What', 'Status', ''].map((h, i) => <th key={i} scope="col" className="sales-cell-left">{h}</th>)}</tr></thead>
      <tbody>{SETUP_STEPS.map((st, i) => <tr key={st.key} className="sales-record-row">
        <td className="sales-cell-left font-medium whitespace-nowrap">{i + 1}. {st.label}</td>
        <td className="sales-cell-left whitespace-nowrap" title={st.key === 'suppliers' || st.key === 'products' ? SUPPLIER_HINT : undefined}>{st.what}</td>
        <td className={`sales-cell-left whitespace-nowrap ${state[st.key] ? 'text-success' : 'text-[#B45309]'}`}>{state[st.key] ? '✓ Done' : 'To do'}</td>
        <td className="sales-cell-left whitespace-nowrap">{st.key === 'books' && !bani ? <span className="text-muted-foreground">By Bani</span> : <Link className="kit-link text-[13px]" to={st.href}>Open</Link>}</td>
      </tr>)}</tbody></table></div>}
  </SettingsCard>;
}
