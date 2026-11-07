import { describe, expect, it, vi, afterEach } from 'vitest';

const auth = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock('npm:@supabase/supabase-js@2', () => ({ createClient: () => ({ auth, from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) }) }));
vi.mock('npm:@supabase/supabase-js@2/cors', () => ({ corsHeaders: {} }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('alert request authentication', () => {
  it('validates the request bearer directly rather than depending on an Auth user fetch', async () => {
    let handler: ((req: Request) => Promise<Response>) | undefined;
    vi.stubGlobal('Deno', { env: { get: () => 'test-binding' }, serve: (fn: typeof handler) => { handler = fn; } });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Auth service unavailable') });
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-user' } }, error: null });
    const entrypoint = '../../supabase/functions/evaluate-alerts/index.ts';
    await import(/* @vite-ignore */ entrypoint);
    if (!handler) throw new Error('No handler registered');
    // A verified caller with no memberships must reach business selection, not return 401.
    const result = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer signed-user-token' }, body: '{}' }));
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Choose a business' });
    expect(auth.getClaims).toHaveBeenCalledWith('signed-user-token');
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});