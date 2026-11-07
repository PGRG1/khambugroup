type Member = { user_id: string; role: string };
type JobRole = { role_key: string; name: string };
type Assignment = { user_id: string; role_key: string | null; status: string };
const normalized = (value: string) => value.trim().toLowerCase();

export function teamRecipients(requested: string[], members: Member[], roles: JobRole[], assignments: Assignment[], sender: string) {
  const wanted = new Set(requested.map(normalized));
  const jobKeys = new Set(roles.filter(r => wanted.has(normalized(r.role_key)) || wanted.has(normalized(r.name))).map(r => r.role_key));
  const access = new Map(assignments.map(a => [a.user_id, a]));
  const ids = [...new Set(members.filter(m => {
    const a = access.get(m.user_id);
    if (m.user_id === sender || a?.status === 'suspended' || a?.status === 'removed') return false;
    return wanted.has('everyone') || wanted.has(normalized(m.role)) || Boolean(a?.role_key && jobKeys.has(a.role_key));
  }).map(m => m.user_id))];
  return { ids, available: [...new Set([...roles.map(r => r.name), ...members.map(m => m.role), 'everyone'])] };
}

export async function loadTeamRecipients(admin: any, tenant: string, requested: string[], sender: string) {
  const [members, roles, assignments] = await Promise.all([
    admin.from('tenant_members').select('user_id,role').eq('tenant_id', tenant),
    admin.from('tenant_roles').select('role_key,name').eq('tenant_id', tenant),
    admin.from('tenant_user_access').select('user_id,role_key,status').eq('tenant_id', tenant),
  ]);
  if (members.error || roles.error || assignments.error) throw new Error('Could not check team recipients.');
  return teamRecipients(requested, members.data ?? [], roles.data ?? [], assignments.data ?? [], sender);
}