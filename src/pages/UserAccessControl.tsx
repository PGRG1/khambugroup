import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { POSITIONS, ALL_PAGES, type UserAccessRecord, type UserPosition, type UserStatus } from "@/utils/permissions";
import { UserEditorPanel } from "@/components/access-control/UserEditorPanel";
import { CreateUserDialog } from "@/components/access-control/CreateUserDialog";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useActiveTenant } from "@/hooks/useActiveTenant";

const UserAccessControl = () => {
  const { isAdmin } = useAuth();
  const { setPreviewUser } = usePreviewMode();
  const { tenantId } = useActiveTenant();
  const [users, setUsers] = useState<UserAccessRecord[]>([]);
  const [venueNameMap, setVenueNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<UserAccessRecord | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const emailRes = await supabase.functions.invoke("list-users");
    const emailMap = new Map<string, string>();
    if (emailRes.data?.users) {
      for (const u of emailRes.data.users) {
        emailMap.set(u.id, u.email);
      }
    }

    const [{ data: profiles }, { data: accessRecords }, { data: pagePerms }, { data: approvers }, { data: venueAccess }, { data: allVenues }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("user_access_control").select("*"),
      supabase.from("user_page_permissions").select("*"),
      supabase.from("forecast_approvers").select("user_id"),
      tenantId
        ? supabase.from("user_venue_access").select("user_id, venue_id").eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as any[] }),
      tenantId
        ? supabase.from("venues").select("id, name").eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as any[] }),
    ]);

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

    setUsers(Array.from(userMap.values()));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);



  if (!isAdmin) return <Navigate to="/" replace />;

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name || "").toLowerCase().includes(search.toLowerCase());
    const matchPosition = positionFilter === "all" || u.position === positionFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
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

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">User Access Control</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage per-user page access, permissions, and visibility</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Create User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            {POSITIONS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading users...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">User</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Position</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Venues</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Pages</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Approver</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user, idx) => (
                <TableRow key={user.user_id} className={idx % 2 === 1 ? "bg-muted/30" : undefined}>
                  <TableCell className="font-mono text-xs">{user.email}</TableCell>
                  <TableCell>{user.display_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{user.position}</Badge>
                  </TableCell>
                  <TableCell>{renderVenueBadge(user)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.pages.filter(p => p.can_access).map(p => (
                        <Badge key={p.page_key} variant="secondary" className="text-[10px]">
                          {ALL_PAGES.find(ap => ap.key === p.page_key)?.label || p.page_key}
                        </Badge>
                      ))}
                      {user.pages.filter(p => p.can_access).length === 0 && (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.is_approver ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30">Yes</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === "active" ? "default" : "destructive"} className="capitalize">
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handlePreviewAs(user)} title="Preview as this user">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingUser(user)}>
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Editor Panel */}
      {editingUser && (
        <UserEditorPanel
          user={editingUser}
          tenantId={tenantId || undefined}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); fetchUsers(); }}
        />
      )}

      {/* Create User Dialog */}
      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        tenantId={tenantId || undefined}
        onCreated={fetchUsers}
      />
    </div>
  );
};

export default UserAccessControl;
