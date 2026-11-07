import { afterEach, describe, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ auth: { getSession: vi.fn(), refreshSession: vi.fn() }, functions: { invoke: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: client }));
import { invokeAlertCheck } from '@/utils/invokeAlertCheck';
const session = { access_token: 'first-token', user: { id: 'existing-user' } };
afterEach(() => vi.resetAllMocks());
describe('interactive alert session recovery', () => {
  it('never invokes alerts without a session', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(invokeAlertCheck({ inbox: true })).rejects.toThrow('Sign in required');
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });
  it('refreshes a rejected session once and preserves the exact request', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.auth.refreshSession.mockResolvedValue({ data: { session: { ...session, access_token: 'fresh-token' } }, error: null });
    const success = { data: { per_tenant: [] }, error: null };
    client.functions.invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 401 } } }).mockResolvedValueOnce(success);
    const body = { tenant_id: 'ff000000-0000-4000-8000-000000000001', inbox: true };
    expect(await invokeAlertCheck(body)).toEqual(success);
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(client.functions.invoke.mock.calls).toEqual([
      ['evaluate-alerts', { body, headers: { Authorization: 'Bearer first-token' } }],
      ['evaluate-alerts', { body, headers: { Authorization: 'Bearer fresh-token' } }],
    ]);
  });
  it('never retries a work action as another user', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.functions.invoke.mockResolvedValue({ error: { context: { status: 401 } } });
    client.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'other-token', user: { id: 'other-user' } } }, error: null });
    await expect(invokeAlertCheck({ work_action: { decision: 'done' } })).rejects.toThrow('Sign in required');
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
  });
  it('keeps permission denial unchanged', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    const denied = { error: { context: { status: 403 } } };
    client.functions.invoke.mockResolvedValue(denied);
    expect(await invokeAlertCheck({ inbox: true })).toEqual(denied);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
});