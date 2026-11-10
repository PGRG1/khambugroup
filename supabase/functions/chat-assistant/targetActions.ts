// Confirmed Bani cards for revenue targets, purchasing spend budgets and instant team notifications.
// Proposals only validate and store a pending card; writes happen on Confirm, as the signed-in user (RLS applies).
import { formatTenantCurrency } from '../_shared/tenantCurrency.ts';
import { loadTeamRecipients } from './teamRecipients.ts';
import { buildRevenuePlan } from './revenuePlan.ts';

export const TARGET_KINDS = ['set_revenue_target', 'set_purchasing_budget', 'send_team_notification'] as const;
const monthOk = (m: unknown) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const label = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function canManageTarget(client: any, t: string, kind: string) {
  const area = kind === 'send_team_notification' ? 'people' : kind === 'set_purchasing_budget' ? 'purchasing' : 'revenue';
  try {
    const [owner, access] = await Promise.all([
      client.rpc('is_owner', { t }),
      client.rpc('access_level', { t, area }),
    ]);
    // Check area access even for owners: suspended/removed assignments must stay denied.
    if (owner.error || access.error || Number(access.data) < 1 || (!owner.data && Number(access.data) < 2)) return false;
    if (kind === 'send_team_notification') return true;
    const money = await client.rpc('money_level', { t });
    return !money.error && money.data === 'everything';
  } catch { return false; }
}

export async function proposeTargetAction(args: any, admin: any, t: string, u: string, userClient: any) {
  if (!await canManageTarget(userClient, t, args.kind)) return { ok: false, error: 'Only owners and managers with access to this work can set targets or send team notifications.' };
  const { data: tenant } = await admin.from('tenants').select('base_currency').eq('id', t).single();
  const cur = tenant?.base_currency ?? 'HKD';
  let title = '', detail = '', payload: Record<string, unknown> = {};

  if (args.kind === 'set_revenue_target') {
    const amount = Number(args.amount);
    if (!monthOk(args.month) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) return { ok: false, error: 'Give the month (YYYY-MM) and a positive target amount.' };
    const { data: venues } = await admin.from('venues').select('id,name').eq('tenant_id', t).eq('is_active', true);
    const names = (venues ?? []).map((v: any) => v.name);
    const picked = Array.isArray(args.venues) && args.venues.length ? args.venues.map((v: string) => names.find((n: string) => n.toLowerCase() === String(v).toLowerCase())) : names;
    if (picked.some((v: any) => !v)) return { ok: false, error: 'Unknown venue.', venues: names };
    const ids = (venues ?? []).filter((v: any) => picked.includes(v.name)).map((v: any) => v.id);
    const [y, m] = args.month.split('-').map(Number);
    const { data: existing } = await admin.from('revenue_targets').select('target_amount').eq('tenant_id', t).eq('year', y).eq('month', m).maybeSingle();
    // Daily plan from the last 8 weeks of same-weekday sales, skipping recurring closed weekdays.
    const since = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);
    const [{ data: sales }, { data: rules }] = await Promise.all([
      admin.from('sales_records').select('venue_id,date,total_sales,guests').eq('tenant_id', t).in('venue_id', ids).gte('date', since).limit(5000),
      admin.from('venue_closure_rules').select('venue_id,weekday,end_date').eq('tenant_id', t).in('venue_id', ids).not('weekday', 'is', null),
    ]);
    const closedW: Record<string, number[]> = {};
    for (const r of rules ?? []) if (!r.end_date) (closedW[r.venue_id] ??= []).push(r.weekday);
    const spendIn = Number(args.avg_spend);
    const guestsIn = Number(args.guests);
    const avgSpend = Number.isFinite(spendIn) && spendIn > 0 ? spendIn : Number.isFinite(guestsIn) && guestsIn > 0 ? amount / guestsIn : null;
    const plan = buildRevenuePlan(y, m, amount, ids, (sales ?? []) as any, closedW, avgSpend);
    const money = (n: number) => formatTenantCurrency(n, cur);
    title = `Plan ${label(args.month)}: ${money(amount)}`;
    detail = [`Venues: ${picked.join(', ')} · ${plan.trading_days} trading days`,
      `Current target: ${existing?.target_amount != null ? money(Number(existing.target_amount)) : 'not set'}`,
      plan.weekday.filter(w => w.per_day).map(w => `${w.day} ${money(w.per_day)}`).join(' · '),
      plan.guests ? `${plan.guests.toLocaleString('en-HK')} guests (≈${Math.round(plan.guests / Math.max(1, plan.trading_days))}/day) at ${money(plan.avg_spend!)} each${plan.history_spend ? ` · usual ${money(plan.history_spend)}` : ''}` : 'No guest history to set a spend target'].join('\n');
    const notes = [typeof args.note === 'string' ? args.note.slice(0, 200) : '', plan.guests ? `Guests ${plan.guests} · avg spend ${plan.avg_spend}` : ''].filter(Boolean).join(' · ');
    payload = { year: y, month: m, amount, venues: picked, notes, daily: plan.plan };
    const { data: card, error } = await admin.from('bani_pending_actions').insert({ tenant_id: t, user_id: u, kind: args.kind, title: title.slice(0, 200), detail: detail.slice(0, 500), payload }).select('id').single();
    return error ? { ok: false, error: 'Could not create the card.' } : { ok: true, action_id: card.id, title, detail, plan: { weekday: plan.weekday, trading_days: plan.trading_days, guests: plan.guests, avg_spend: plan.avg_spend, usual_spend: plan.history_spend }, note: 'Plan card shown; nothing saved until Confirm. Explain the plan briefly (busiest/quietest days, guests and spend) and offer to adjust the amount, avg spend or guests — re-propose with new values if asked.' };
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
    let recipients;
    try { recipients = await loadTeamRecipients(admin, t, roles, u); }
    catch { return { ok: false, error: 'Could not check team recipients.' }; }
    const { ids } = recipients;
    if (!ids.length) return { ok: false, error: 'No team members have those roles.', roles: recipients.available };
    title = `Notify ${roles.join(', ')}: ${subject}`;
    detail = `${message}\nRecipients: ${ids.length} people`;
    payload = { user_ids: ids, recipient_roles: roles, title: subject, body: message };
  }
  const { data: card, error } = await admin.from('bani_pending_actions').insert({ tenant_id: t, user_id: u, kind: args.kind, title: title.slice(0, 200), detail: detail.slice(0, 500), payload }).select('id').single();
  return error ? { ok: false, error: 'Could not create the card.' } : { ok: true, action_id: card.id, title, detail, note: 'Card shown; nothing is saved or sent until the user taps Confirm.' };
}

export async function confirmTargetAction(r: any, admin: any, userClient: any, t: string, u: string, supabaseUrl: string, serviceKey: string) {
  const p = r.payload ?? {};
  if (!await canManageTarget(userClient, t, r.kind)) return { status: 403, body: { error: 'Only owners and managers with access to this work can do this.' } };
  if (r.kind === 'set_revenue_target') {
    const { error } = await userClient.from('revenue_targets').upsert({ tenant_id: t, year: p.year, month: p.month, target_amount: p.amount, venues: p.venues, notes: p.notes ?? '', created_by: u }, { onConflict: 'tenant_id,year,month' });
    if (error) return { status: 403, body: { error: 'Could not save the target: ' + error.message } };
    if (Array.isArray(p.daily) && p.daily.length) {
      const rows = p.daily.map((d: any) => ({ tenant_id: t, venue_id: d.venue_id, target_date: d.date, projected_sales: Math.max(0, Number(d.amount) || 0), created_by: u }));
      const { error: dErr } = await userClient.from('revenue_daily_projections').upsert(rows, { onConflict: 'tenant_id,venue_id,target_date' });
      if (dErr) return { status: 403, body: { error: 'Monthly target saved, but the daily plan could not be saved: ' + dErr.message } };
    }
    return { status: 200, body: { ok: true, message: 'Revenue target and daily plan saved. Open Revenue targets to see each day.' } };
  }
  if (r.kind === 'set_purchasing_budget') {
    const { error } = await userClient.rpc('save_purchasing_budgets', { p_tenant_id: t, p_venue_id: p.venue_id, p_month: p.month, p_amounts: p.amounts, p_note: p.note });
    return error ? { status: 403, body: { error: 'Could not save the budget: ' + error.message } } : { status: 200, body: { ok: true, message: 'Purchasing budget saved.' } };
  }
  // Revalidate membership/assignments, but never broaden the recipients approved on the card.
  let recipients;
  try { recipients = await loadTeamRecipients(admin, t, Array.isArray(p.recipient_roles) ? p.recipient_roles : ['everyone'], u); }
  catch { return { status: 502, body: { error: 'Could not check team recipients.' } }; }
  const ids = recipients.ids.filter((id: string) => Array.isArray(p.user_ids) && p.user_ids.includes(id));
  if (!ids.length) return { status: 409, body: { error: 'No recipients still match this card. Ask Bani again.', roles: recipients.available } };
  const { data: sender, error: senderError } = await admin.from('profiles').select('display_name').eq('user_id', u).maybeSingle();
  if (senderError) return { status: 502, body: { error: 'Could not check the sender.' } };
  const { error: deliveryError } = await admin.from('bani_team_messages').upsert(ids.map((recipient_id: string) => ({
    tenant_id: t, recipient_id, sender_id: u, sender_name: sender?.display_name?.trim() || 'Team member',
    action_id: r.id, title: p.title, body: p.body,
  })), { onConflict: 'action_id,recipient_id', ignoreDuplicates: true });
  if (deliveryError) return { status: 502, body: { error: 'The in-app message could not be delivered.' } };
  const delivered = `Delivered in the app to ${ids.length} ${ids.length === 1 ? 'person' : 'people'}.`;
  let res;
  try {
    res = await fetch(supabaseUrl + '/functions/v1/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + serviceKey }, body: JSON.stringify({ user_ids: ids, payload: { title: p.title, body: p.body, url: '/', tag: 'bani-team-' + r.id } }) });
  } catch { return { status: 200, body: { ok: true, message: delivered + ' Phone push could not be sent.' } }; }
  if (!res.ok) return { status: 200, body: { ok: true, message: delivered + ' Phone push could not be sent.' } };
  const sent = Number((await res.json().catch(() => ({})))?.sent ?? 0);
  return { status: 200, body: { ok: true, message: delivered + (sent > 0 ? ` Push sent to ${sent} device${sent === 1 ? '' : 's'}.` : '') } };
}
