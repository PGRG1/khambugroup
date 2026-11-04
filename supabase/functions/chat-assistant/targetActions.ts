// Confirmed Bani cards for revenue targets, purchasing spend budgets and instant team notifications.
// Proposals only validate and store a pending card; writes happen on Confirm, as the signed-in user (RLS applies).
import { formatTenantCurrency } from '../_shared/tenantCurrency.ts';

export const TARGET_KINDS = ['set_revenue_target', 'set_purchasing_budget', 'send_team_notification'] as const;
const MANAGER_ROLES = ['owner', 'tenant_admin', 'admin', 'manager', 'gm', 'finance'];
const monthOk = (m: unknown) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const label = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function proposerRole(admin: any, t: string, u: string) {
  const { data } = await admin.from('tenant_members').select('role').eq('tenant_id', t).eq('user_id', u).maybeSingle();
  return data?.role as string | undefined;
}

export async function proposeTargetAction(args: any, admin: any, t: string, u: string) {
  const role = await proposerRole(admin, t, u);
  if (!role || !MANAGER_ROLES.includes(role)) return { ok: false, error: 'Only owners and managers can set targets or send team notifications.' };
  const { data: tenant } = await admin.from('tenants').select('base_currency').eq('id', t).single();
  const cur = tenant?.base_currency ?? 'HKD';
  let title = '', detail = '', payload: Record<string, unknown> = {};

  if (args.kind === 'set_revenue_target') {
    const amount = Number(args.amount);
    if (!monthOk(args.month) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) return { ok: false, error: 'Give the month (YYYY-MM) and a positive target amount.' };
    const { data: venues } = await admin.from('venues').select('name').eq('tenant_id', t);
    const names = (venues ?? []).map((v: any) => v.name);
    const picked = Array.isArray(args.venues) && args.venues.length ? args.venues.map((v: string) => names.find((n: string) => n.toLowerCase() === String(v).toLowerCase())) : names;
    if (picked.some((v: any) => !v)) return { ok: false, error: 'Unknown venue.', venues: names };
    const [y, m] = args.month.split('-').map(Number);
    const { data: existing } = await admin.from('revenue_targets').select('target_amount').eq('tenant_id', t).eq('year', y).eq('month', m).maybeSingle();
    title = `Set ${label(args.month)} revenue target: ${formatTenantCurrency(amount, cur)}`;
    detail = `Venues: ${picked.join(', ')}\nCurrent target: ${existing?.target_amount != null ? formatTenantCurrency(Number(existing.target_amount), cur) : 'not set'}`;
    payload = { year: y, month: m, amount, venues: picked, notes: typeof args.note === 'string' ? args.note.slice(0, 300) : '' };
  } else if (args.kind === 'set_purchasing_budget') {
    if (!monthOk(args.month) || !Array.isArray(args.budgets) || !args.budgets.length) return { ok: false, error: 'Give the month (YYYY-MM) and at least one category amount.' };
    const { data: cats } = await admin.from('product_categories').select('name').eq('tenant_id', t);
    const known = [...new Set((cats ?? []).map((c: any) => String(c.name)))] as string[];
    const amounts: Record<string, number> = {};
    for (const b of args.budgets) {
      const name = known.find(k => k.toLowerCase() === String(b?.category ?? '').trim().toLowerCase());
      const amt = Number(b?.amount);
      if (!name || /deposit|adjust/i.test(name)) return { ok: false, error: `Unknown or non-budgetable category "${b?.category}".`, categories: known.filter(k => !/deposit|adjust/i.test(k)) };
      if (!Number.isFinite(amt) || amt < 0 || amt > 1e12) return { ok: false, error: 'Budget amounts must be zero or positive.' };
      amounts[name] = amt;
    }
    let venueId: string | null = null, venueName = 'Whole group';
    if (args.venue) {
      const { data: venues } = await admin.from('venues').select('id,name').eq('tenant_id', t);
      const v = (venues ?? []).find((x: any) => x.name.toLowerCase() === String(args.venue).toLowerCase());
      if (!v) return { ok: false, error: 'Unknown venue.' };
      venueId = v.id; venueName = v.name;
    }
    const total = Object.values(amounts).reduce((a, b) => a + b, 0);
    title = `Set ${label(args.month)} purchasing budget: ${formatTenantCurrency(total, cur)}`;
    detail = `${venueName}\n` + Object.entries(amounts).map(([k, v]) => `${k}: ${formatTenantCurrency(v, cur)}`).join('\n');
    payload = { month: args.month + '-01', venue_id: venueId, amounts, note: typeof args.note === 'string' ? args.note.slice(0, 300) : 'Set via Bani' };
  } else {
    const message = typeof args.message === 'string' ? args.message.trim().slice(0, 300) : '';
    const subject = typeof args.title === 'string' ? args.title.trim().slice(0, 80) : '';
    const roles = Array.isArray(args.recipient_roles) ? args.recipient_roles.map(String) : [];
    if (!message || !subject || !roles.length) return { ok: false, error: 'Give a short title, the message and who should receive it.' };
    const { data: members } = await admin.from('tenant_members').select('user_id,role').eq('tenant_id', t);
    const ids = (members ?? []).filter((m: any) => roles.includes('everyone') || roles.includes(m.role)).map((m: any) => m.user_id).filter((id: string) => id !== u);
    if (!ids.length) return { ok: false, error: 'No team members have those roles.', roles: [...new Set((members ?? []).map((m: any) => m.role))] };
    title = `Notify ${roles.join(', ')}: ${subject}`;
    detail = `${message}\nRecipients: ${ids.length} people`;
    payload = { user_ids: ids, title: subject, body: message };
  }
  const { data: card, error } = await admin.from('bani_pending_actions').insert({ tenant_id: t, user_id: u, kind: args.kind, title: title.slice(0, 200), detail: detail.slice(0, 500), payload }).select('id').single();
  return error ? { ok: false, error: 'Could not create the card.' } : { ok: true, action_id: card.id, title, detail, note: 'Card shown; nothing is saved or sent until the user taps Confirm.' };
}

export async function confirmTargetAction(r: any, admin: any, userClient: any, t: string, u: string, supabaseUrl: string, serviceKey: string) {
  const p = r.payload ?? {};
  const role = await proposerRole(admin, t, u);
  if (!role || !MANAGER_ROLES.includes(role)) return { status: 403, body: { error: 'Only owners and managers can do this.' } };
  if (r.kind === 'set_revenue_target') {
    const { error } = await userClient.from('revenue_targets').upsert({ tenant_id: t, year: p.year, month: p.month, target_amount: p.amount, venues: p.venues, notes: p.notes ?? '', created_by: u }, { onConflict: 'tenant_id,year,month' });
    return error ? { status: 403, body: { error: 'Could not save the target: ' + error.message } } : { status: 200, body: { ok: true, message: 'Revenue target saved.' } };
  }
  if (r.kind === 'set_purchasing_budget') {
    const { error } = await userClient.rpc('save_purchasing_budgets', { p_tenant_id: t, p_venue_id: p.venue_id, p_month: p.month, p_amounts: p.amounts, p_note: p.note });
    return error ? { status: 403, body: { error: 'Could not save the budget: ' + error.message } } : { status: 200, body: { ok: true, message: 'Purchasing budget saved.' } };
  }
  const res = await fetch(supabaseUrl + '/functions/v1/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + serviceKey }, body: JSON.stringify({ user_ids: p.user_ids, payload: { title: p.title, body: p.body, url: '/', tag: 'bani-team-' + r.id } }) });
  if (!res.ok) return { status: 502, body: { error: 'Notification could not be sent.' } };
  const sent = Number((await res.json().catch(() => ({})))?.sent ?? 0);
  return { status: 200, body: { ok: true, message: sent > 0 ? `Sent to ${sent} device${sent === 1 ? '' : 's'}.` : 'No recipients have phone notifications switched on, so nothing was delivered.' } };
}
