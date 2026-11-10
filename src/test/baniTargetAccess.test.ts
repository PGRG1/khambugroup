import { describe, expect, it, vi } from 'vitest';
import { proposeTargetAction, confirmTargetAction } from '../../supabase/functions/chat-assistant/targetActions';

function clients(owner: boolean, level: number, error = false) {
  const rpc = vi.fn(async (name: string) => ({ data: name === 'is_owner' ? owner : name === 'money_level' ? 'everything' : level, error: error ? { message: 'unavailable' } : null }));
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null }), single: async () => ({ data: { base_currency: 'HKD' } }) };
  return { user: { rpc }, admin: { from: vi.fn(() => chain) } };
}

describe('Bani target owner permissions', () => {
  it('recognizes a server-validated owner without a legacy membership lookup', async () => {
    const c = clients(true, 3);
    const out = await proposeTargetAction({ kind: 'set_revenue_target', month: 'invalid', amount: 1 }, c.admin, 'tenant', 'owner', c.user);
    expect(out.error).toBe('Give the month (YYYY-MM) and a positive target amount.');
    expect(c.user.rpc).toHaveBeenCalledWith('is_owner', { t: 'tenant' });
  });
  it('denies suspended owners before preparing anything', async () => {
    const c = clients(true, 0);
    const out = await proposeTargetAction({ kind: 'set_revenue_target' }, c.admin, 'tenant', 'owner', c.user);
    expect(out.ok).toBe(false);
    expect(c.admin.from).not.toHaveBeenCalled();
  });
  it('rechecks revoked access before confirmation writes', async () => {
    const c = clients(false, 1);
    const out = await confirmTargetAction({ kind: 'set_revenue_target', payload: {} }, c.admin, c.user, 'tenant', 'owner', '', '');
    expect(out.status).toBe(403);
    expect(c.admin.from).not.toHaveBeenCalled();
  });
  it('fails closed when permission validation fails', async () => {
    const c = clients(true, 3, true);
    const out = await proposeTargetAction({ kind: 'set_revenue_target' }, c.admin, 'tenant', 'owner', c.user);
    expect(out.ok).toBe(false);
    expect(c.admin.from).not.toHaveBeenCalled();
  });
});