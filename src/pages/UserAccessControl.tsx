import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { POSITIONS, type UserAccessRecord, type UserPosition, type UserStatus } from "@/utils/permissions";
import { InviteCard, PersonAccessCard, type PersonAccess } from "@/components/access-control/RoleAssign";
import { ROLE_COLUMNS, type TenantRole } from "@/utils/roleAccess";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { tenantMemberUsers } from "@/utils/settingsFacts";
import { Toolbar } from "@/components/kit/Toolbar";
import { Status, PhoneRow, keyOpen } from "@/components/finance/accounting/AccountingKit";
import { PageAction } from '@/components/settings/SettingsForm';

const UserAccessControl = () => {
  const { isAdmin } = useAuth();
  const { isPlatformAdmin } = usePlatformAdmin();
  const [clientManages, setClientManages] = useState(false);
  const { setPreviewUser } = usePreviewMode();
  const { tenantId } = useActiveTenant();
  // Who manages this business's users is set by Bani on the control plane (Bani by default).
  useEffect(() => { let on = true; setClientManages(false); if (!tenantId) return;
    void supabase.from("tenants").select("users_managed_by").eq("id", tenantId).maybeSingle().then(({ data }) => { if (on) setClientManages((data as any)?.users_managed_by === "client"); });
    return () => { on = false; }; }, [tenantId]);
  const [users, setUsers] = useState<UserAccessRecord[]>([]);
  const [venueNameMap, setVenueNameMap] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<Record<string, PersonAccess>>({});
  const [venueList, setVenueList] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<UserAccessRecord | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!tenantId) { setUsers([]); setLoading(false); return; }
    setLoading(true);
    const {data:members,error:memberError}=await supabase.from('tenant_members').select('user_id').eq('tenant_id',tenantId);
    if(memberError){setUsers([]);setLoading(false);toast({title:memberError.message,variant:'destructive'});return;}
    const memberIds=(members??[]).map(m=>m.user_id);
    // Roles and venues load first, so a business with no people yet can still add its first person.
    const [{ data: roleRows0 }, { data: venueRows0 }] = await Promise.all([
      supabase.from("tenant_roles").select(ROLE_COLUMNS).eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("venues").select("id, name, is_active").eq("tenant_id", tenantId).order("name"),
    ]);
    setRoles((roleRows0 ?? []) as unknown as TenantRole[]);
    setVenueList((venueRows0 ?? []) as any);
    if(!memberIds.length){setUsers([]);setAccess({});setLoading(false);return;}
    const emailRes = await supabase.functions.invoke("list-users");
    const emailMap = new Map<string, string>();
    const pendingIds = new Set<string>();
    if (emailRes.data?.users) {
      for (const u of emailRes.data.users) {
        emailMap.set(u.id, u.email);
        if (u.pending_password) pendingIds.add(u.id);
      }
    }
    setPending(pendingIds);

    const [{ data: profiles }, { data: accessRecords }, { data: pagePerms }, { data: approvers }, { data: venueAccess }, { data: allVenues }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in('user_id',memberIds),
      supabase.from("user_access_control").select("*").eq('tenant_id',tenantId).in('user_id',memberIds),
      supabase.from("user_page_permissions").select("*").eq('tenant_id',tenantId).in('user_id',memberIds),
      supabase.from("forecast_approvers").select("user_id").in('user_id',memberIds),
      tenantId
        ? supabase.from("user_venue_access").select("user_id, venue_id").eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as any[] }),
      tenantId
        ? supabase.from("venues").select("id, name, is_active").eq("tenant_id", tenantId).order("name")
        : Promise.resolve({ data: [] as any[] }),
    ]);
    // Roles (set by Bani) and each person's role and venues.
    const [{ data: roleRows }, { data: accessRows }, { data: accessVenues }] = await Promise.all([
      supabase.from("tenant_roles").select(ROLE_COLUMNS).eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("tenant_user_access").select("user_id, role_key, all_venues, status").eq("tenant_id", tenantId),
      supabase.from("tenant_user_venues").select("user_id, venue_id").eq("tenant_id", tenantId),
    ]);
    setRoles((roleRows ?? []) as unknown as TenantRole[]);
    const acc: Record<string, PersonAccess> = {};
    for (const a of accessRows ?? []) acc[a.user_id] = { role_key: a.role_key, all_venues: a.all_venues, status: a.status, venue_ids: [] };
    for (const v of accessVenues ?? []) acc[v.user_id]?.venue_ids.push(v.venue_id);
    setAccess(acc);
    setVenueList((allVenues ?? []) as any);

    const vMap: Record<string, string> = {};
    for (const v of (allVenues || [])) vMap[v.id] = v.name;
    setVenueNameMap(vMap);

    const venueByUser = new Map<string, string[]>();
    for (const row of (venueAccess || [])) {
      const arr = venueByUser.get(row.user_id) || [];
      arr.push(row.venue_id);
      venueByUser.set(row.user_id, arr);
    }

    const approverIds = new Set((approvers || []).map(a => a.user_id));
    const userMap = new Map<string, UserAccessRecord>();
    for(const id of new Set(memberIds))userMap.set(id,{user_id:id,email:emailMap.get(id)||'New member',display_name:null,position:'viewer',status:'active',is_approver:approverIds.has(id),pages:[],venue_ids:venueByUser.get(id)||[]});

    for (const p of (profiles || [])) {
      userMap.set(p.user_id, {
        user_id: p.user_id,
        email: emailMap.get(p.user_id) || p.display_name || "Unknown",
        display_name: p.display_name,
        position: "viewer",
        status: "active",
        is_approver: approverIds.has(p.user_id),
        pages: [],
        venue_ids: venueByUser.get(p.user_id) || [],
      });
    }

    for (const ac of (accessRecords || [])) {
      const u = userMap.get(ac.user_id);
      if (u) {
        u.position = ac.position as UserPosition;
        u.status = ac.status as UserStatus;
      }
    }

    for (const pp of (pagePerms || [])) {
      const u = userMap.get(pp.user_id);
      if (u) {
        u.pages.push({
          page_key: pp.page_key as any,
          show_in_sidebar: pp.show_in_sidebar,
          can_access: pp.can_access,
          authority: pp.authority as any,
          hidden_actions: (pp.hidden_actions as string[]) || [],
        });
      }
    }

    setUsers(tenantMemberUsers(Array.from(userMap.values()),members??[]));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);



  if (!isAdmin) return <Navigate to="/" replace />;
  const canManage = isPlatformAdmin || clientManages; // the database and invite function enforce the same rule
  const openUser = (u: UserAccessRecord) => { if (canManage) setEditingUser(u); };

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name || "").toLowerCase().includes(search.toLowerCase());
    const matchPosition = positionFilter === "all" || (access[u.user_id]?.role_key ?? "none") === positionFilter;
    const matchStatus = true;
    return matchSearch && matchPosition && matchStatus;
  });

  const handlePreviewAs = (user: UserAccessRecord) => {
    setPreviewUser(user.user_id, user.email);
    toast({ title: "Preview Mode", description: `Now previewing as ${user.display_name || user.email}` });
  };

  const renderVenueBadge = (u: UserAccessRecord) => {
    if (!u.venue_ids || u.venue_ids.length === 0) {
      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">All venues</Badge>;
    }
    const names = u.venue_ids.map(id => venueNameMap[id]).filter(Boolean);
    const shown = names.slice(0, 2).join(", ");
    const extra = names.length > 2 ? ` + ${names.length - 2} more` : "";
    return (
      <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">
        {shown}{extra}
      </Badge>
    );
  };

  const venuesOpen = venueList.filter(v => v.is_active);
  if (canManage && tenantId && showCreateDialog) return <div className="contents"><InviteCard tenantId={tenantId} roles={roles} venues={venuesOpen} canOwner={isPlatformAdmin}
    onClose={() => setShowCreateDialog(false)} onDone={() => { setShowCreateDialog(false); void fetchUsers(); }} /></div>;
  if (canManage && tenantId && editingUser) return <div className="contents"><PersonAccessCard key={editingUser.user_id} tenantId={tenantId} userId={editingUser.user_id}
    name={editingUser.display_name || editingUser.email} email={editingUser.email} pending={pending.has(editingUser.user_id)} access={access[editingUser.user_id]} roles={roles} venues={venuesOpen} canOwner={isPlatformAdmin}
    onClose={() => setEditingUser(null)} onSaved={() => { setEditingUser(null); void fetchUsers(); }} /></div>;
  return (
    <div className="contents">
      {canManage ? <PageAction><Button size="sm" className="h-10 rounded-full" onClick={() => setShowCreateDialog(true)}><UserPlus className="h-4 w-4" />Add person</Button></PageAction>
        : null}
      {(() => {
        // Role and venues come from the access roles Bani set up; people not given a role yet show their old position in grey.
        const venuesOf = (u: typeof users[number]) => { const a = access[u.user_id]; const ids = a ? (a.all_venues ? [] : a.venue_ids) : u.venue_ids ?? [];
          return a?.all_venues || !ids.length ? "All venues" : ids.map(id => venueNameMap[id]).filter(Boolean).join(", "); };
        const newRole = (u: typeof users[number]) => roles.find(r => r.role_key === access[u.user_id]?.role_key)?.name;
        const roleOf = (u: typeof users[number]) => newRole(u) ?? POSITIONS.find(p => p.value === u.position)?.label ?? u.position;
        const invited = users.filter(u => u.status !== "active").length;
        // One card for the list, like Team, Supplier accounts and Payables: the count, then filter and search, then rows.
        return <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="People">
          <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{users.length} {users.length === 1 ? "person" : "people"}</span>{invited > 0 && <span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {invited} not active</span>}{!canManage && <span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· Bani manages users</span>}</h2>
          <Toolbar search={search} onSearch={setSearch} placeholder="Search people" searchAfterControls mobileSearchBelow filter={<Select value={positionFilter} onValueChange={setPositionFilter}><SelectTrigger className="h-9 w-40 rounded-full" aria-label="Role"><SelectValue placeholder="Role" /></SelectTrigger><SelectContent><SelectItem value="all">Every role</SelectItem>{roles.map(r => <SelectItem key={r.role_key} value={r.role_key}>{r.name}</SelectItem>)}<SelectItem value="none">No role yet</SelectItem></SelectContent></Select>} />

          <ul className="min-[768px]:hidden kit">{filtered.map(u => <PhoneRow key={u.user_id} flag={u.status !== "active" && "Disabled"} title={u.display_name || u.email} amount={roleOf(u)} sub={u.status === "active" ? venuesOf(u) : `${venuesOf(u)} · Disabled`} tone={u.status === "active" ? "mut" : "amber"} onOpen={() => openUser(u)} />)}</ul>
          <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="People table"><table className="sales-table" aria-label="People">
            <thead><tr><th scope="col" className="sales-cell-left">Person</th><th scope="col" className="sales-cell-left">Role</th><th scope="col" className="sales-cell-left">Venues</th><th scope="col" className="sales-cell-left">Status</th></tr></thead>
            <tbody>{filtered.map(u => <tr key={u.user_id} className="sales-record-row" {...(canManage ? keyOpen(() => openUser(u)) : {})}>
              <td className="sales-cell-left" title={`${u.display_name || ""} ${u.email}`}>{u.display_name || u.email}</td>
              <td className={`sales-cell-left ${newRole(u) ? "" : "text-muted-foreground"}`} title={newRole(u) ? undefined : "No role yet"}>{roleOf(u)}</td>
              <td className="sales-cell-left" title={venuesOf(u)}>{venuesOf(u)}</td>
              <td className="sales-cell-left">{u.status !== "active" ? <Status text="Disabled" tone="mut" /> : pending.has(u.user_id) ? <Status text="Password not set" tone="amber" /> : <Status text="Active" tone="ok" />}</td>
            </tr>)}</tbody></table></div>
          {!filtered.length && <p className="p-10 text-center text-sm text-muted-foreground">{loading ? "Loading people…" : search || positionFilter !== "all" ? "Nothing matches your search or filters." : "No people yet."}</p>}
        </section>;
      })()}

    </div>
  );
};

export default UserAccessControl;
