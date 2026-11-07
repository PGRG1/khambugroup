import { describe, expect, it, vi, afterEach } from 'vitest';
import { teamRecipients } from '../../supabase/functions/chat-assistant/teamRecipients';
import { confirmTargetAction } from '../../supabase/functions/chat-assistant/targetActions';

const members = [{ user_id: 'sender', role: 'tenant_admin' }, { user_id: 'chef', role: 'member' }, { user_id: 'gm', role: 'manager' }, { user_id: 'removed', role: 'member' }];
const roles = [{ role_key: 'head_chef', name: 'Head chef' }, { role_key: 'general_manager', name: 'General manager' }];
const assignments = [{ user_id: 'chef', role_key: 'head_chef', status: 'active' }, { user_id: 'gm', role_key: 'general_manager', status: 'active' }, { user_id: 'removed', role_key: 'head_chef', status: 'removed' }];

describe('team recipient routing', () => {
  it.each(['head_chef', ' Head CHEF '])('matches assigned job role %s', requested => {
    expect(teamRecipients([requested], members, roles, assignments, 'sender').ids).toEqual(['chef']);
  });
  it('matches general_manager by key', () => {
    expect(teamRecipients(['general_manager'], members, roles, assignments, 'sender').ids).toEqual(['gm']);
  });
  it('keeps membership-role targeting', () => {
    expect(teamRecipients(['manager'], members, roles, assignments, 'sender').ids).toEqual(['gm']);
  });
  it('everyone targets each current recipient once, excluding sender and removed access', () => {
    expect(teamRecipients(['everyone', 'Head chef'], members, roles, assignments, 'sender').ids).toEqual(['chef', 'gm']);
  });
  it('returns available names when nothing matches', () => {
    const result = teamRecipients(['bartender'], members, roles, assignments, 'sender');
    expect(result.ids).toEqual([]);
    expect(result.available).toEqual(['Head chef', 'General manager', 'tenant_admin', 'member', 'manager', 'everyone']);
  });
});

function fakeAdmin(failDelivery = false) {
  const writes: any[] = [];
  const scopes: any[] = [];
  return { writes, scopes, from: (table: string) => {
    const data = table === 'tenant_members' ? members : table === 'tenant_roles' ? roles : table === 'tenant_user_access' ? assignments : { display_name: 'Demo owner' };
    const chain: any = {
      select: () => chain,
      eq: (column: string, value: string) => { scopes.push([table, column, value]); return chain; },
      maybeSingle: async () => ({ data: table === 'tenant_members' ? { role: 'tenant_admin' } : data, error: null }),
      then: (resolve: any) => resolve({ data, error: null }),
      upsert: async (rows: any[], options: any) => { writes.push({ table, rows, options }); return { error: failDelivery ? { message: 'unavailable' } : null }; },
    };
    return chain;
  } };
}
afterEach(() => vi.unstubAllGlobals());
describe('confirmed team delivery', () => {
  const card = { id: 'card', kind: 'send_team_notification', payload: { recipient_roles: ['everyone'], user_ids: ['chef', 'gm', 'foreign-user'], title: 'Targets ready', body: 'Please review.' } };
  it('stores one tenant-scoped message per approved current recipient, even without push devices', async () => {
    const admin = fakeAdmin();
    const push = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({ sent: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', push);
    const out = await confirmTargetAction(card, admin, {}, 'qa-tenant', 'sender', 'https://example.invalid', 'test-key');
    expect(out.status).toBe(200);
    expect(admin.writes[0].rows).toEqual(['chef', 'gm'].map(recipient_id => ({ tenant_id: 'qa-tenant', recipient_id, sender_id: 'sender', sender_name: 'Demo owner', action_id: 'card', title: 'Targets ready', body: 'Please review.' })));
    expect(admin.writes[0].options).toEqual({ onConflict: 'action_id,recipient_id', ignoreDuplicates: true });
    expect(out.body.message).toContain('Delivered in the app to 2 people.');
    const options = push.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body)).user_ids).toEqual(['chef', 'gm']);
    expect(admin.scopes.filter(s => ['tenant_roles','tenant_user_access'].includes(s[0]))).toEqual([['tenant_roles','tenant_id','qa-tenant'], ['tenant_user_access','tenant_id','qa-tenant']]);
  });
  it('does not push or report success if in-app saving fails', async () => {
    const push = vi.fn(); vi.stubGlobal('fetch', push);
    const out = await confirmTargetAction(card, fakeAdmin(true), {}, 'qa-tenant', 'sender', 'https://example.invalid', 'test-key');
    expect(out.status).toBe(502);
    expect(push).not.toHaveBeenCalled();
  });
  it('reports push devices in addition to in-app delivery', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sent: 3 }), { status: 200 })));
    const out = await confirmTargetAction(card, fakeAdmin(), {}, 'qa-tenant', 'sender', 'https://example.invalid', 'test-key');
    expect(out.body.message).toContain('Push sent to 3 devices.');
  });
});