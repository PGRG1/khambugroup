import { afterEach, describe, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ auth: { getSession: vi.fn(), refreshSession: vi.fn() }, functions: { invoke: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: client }));
import { invokeCreateUser } from '@/utils/invokeCreateUser';
const session = { access_token: 'first-token', user: { id: 'existing-user' } };
const body = { tenant_id: 'ff000000-0000-4000-8000-000000000001', email: 'example@example.com' };
afterEach(() => vi.resetAllMocks());
describe('create-user authentication recovery', () => {
  it('does not send a request without a session', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect((await invokeCreateUser(body)).error?.message).toContain('sign in again');
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });
  it('sends the signed-in token and preserves a successful result without retrying', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    const success = { data: { success: true }, error: null };
    client.functions.invoke.mockResolvedValue(success);
    expect(await invokeCreateUser(body)).toEqual(success);
    expect(client.functions.invoke).toHaveBeenCalledWith('create-user', { body, headers: { Authorization: 'Bearer first-token' } });
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
  it.each([401, 400])('retries an authentication rejection (%s) once with the same body', async (status) => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.auth.refreshSession.mockResolvedValue({ data: { session: { ...session, access_token: 'fresh-token' } }, error: null });
    const rejection = { data: null, error: { context: new Response(JSON.stringify({ error: 'Unauthorized' }), { status }) } };
    client.functions.invoke.mockResolvedValue(rejection);
    expect(await invokeCreateUser(body)).toEqual(rejection);
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(client.functions.invoke.mock.calls).toEqual([
      ['create-user', { body, headers: { Authorization: 'Bearer first-token' } }],
      ['create-user', { body, headers: { Authorization: 'Bearer fresh-token' } }],
    ]);
    expect(await rejection.error.context.json()).toEqual({ error: 'Unauthorized' });
  });
  it('never retries as another person', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.functions.invoke.mockResolvedValue({ error: { context: { status: 401 } } });
    client.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'other', user: { id: 'other-person' } } }, error: null });
    expect((await invokeCreateUser(body)).error?.message).toContain('sign in again');
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([400, 403, 500])('does not retry validation, permission or post-write errors (%s)', async (status) => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    const failure = { data: null, error: { context: new Response(JSON.stringify({ error: 'Admin only' }), { status }) } };
    client.functions.invoke.mockResolvedValue(failure);
    expect(await invokeCreateUser(body)).toEqual(failure);
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
  });
  it('returns network exceptions to the form rather than crashing it', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    client.functions.invoke.mockRejectedValue(new Error('Network unavailable'));
    expect((await invokeCreateUser(body)).error?.message).toBe('Network unavailable');
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
});