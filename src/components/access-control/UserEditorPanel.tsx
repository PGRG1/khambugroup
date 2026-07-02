import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { X, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/utils/auditLog";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import {
  ALL_PAGES, PAGE_ACTIONS, POSITIONS, AUTHORITIES,
  type UserAccessRecord, type UserPosition, type UserStatus, type Authority, type PageKey,
} from "@/utils/permissions";

interface Props {
  user: UserAccessRecord;
  onClose: () => void;
  onSaved: () => void;
  /** Tenant scope for venue-access and page-permission writes. Falls back to active tenant. */
  tenantId?: string;
}

type VenueRow = { id: string; name: string };

export function UserEditorPanel({ user, onClose, onSaved, tenantId }: Props) {
  const { tenantId: activeTenantId } = useActiveTenant();
  const effectiveTenantId = tenantId || activeTenantId || null;

  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [position, setPosition] = useState<UserPosition>(user.position);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [isApprover, setIsApprover] = useState(user.is_approver);
  const [pages, setPages] = useState(
    ALL_PAGES.map(p => {
      const existing = user.pages.find(up => up.page_key === p.key);
      return {
        page_key: p.key as PageKey,
        show_in_sidebar: existing?.show_in_sidebar ?? true,
        can_access: existing?.can_access ?? true,
        authority: (existing?.authority ?? "view_only") as Authority,
        hidden_actions: existing?.hidden_actions ?? [],
      };
    })
  );
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [venueSelection, setVenueSelection] = useState<Set<string>>(new Set(user.venue_ids || []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!effectiveTenantId) return;
    (async () => {
      const { data } = await supabase
        .from("venues")
        .select("id, name")
        .eq("tenant_id", effectiveTenantId)
        .order("name");
      setVenues((data as VenueRow[]) || []);
    })();
  }, [effectiveTenantId]);

  const updatePage = (pageKey: string, field: string, value: any) => {
    setPages(prev => prev.map(p => p.page_key === pageKey ? { ...p, [field]: value } : p));
  };

  const toggleAction = (pageKey: string, actionKey: string) => {
    setPages(prev => prev.map(p => {
      if (p.page_key !== pageKey) return p;
      const actions = p.hidden_actions.includes(actionKey)
        ? p.hidden_actions.filter(a => a !== actionKey)
        : [...p.hidden_actions, actionKey];
      return { ...p, hidden_actions: actions };
    }));
  };

  const toggleVenue = (venueId: string) => {
    setVenueSelection(prev => {
      const next = new Set(prev);
      if (next.has(venueId)) next.delete(venueId); else next.add(venueId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!effectiveTenantId) {
      toast({ title: "Missing tenant", description: "No active tenant to save against.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.user_id);

      await supabase.from("user_access_control")
        .update({ position, status })
        .eq("user_id", user.user_id)
        .eq("tenant_id", effectiveTenantId);

      for (const p of pages) {
        await supabase.from("user_page_permissions").upsert({
          user_id: user.user_id,
          tenant_id: effectiveTenantId,
          page_key: p.page_key,
          show_in_sidebar: p.show_in_sidebar,
          can_access: p.can_access,
          authority: p.authority,
          hidden_actions: p.hidden_actions,
        }, { onConflict: "user_id,tenant_id,page_key" });
      }

      // Replace venue access rows for this (user, tenant)
      await supabase.from("user_venue_access")
        .delete()
        .eq("user_id", user.user_id)
        .eq("tenant_id", effectiveTenantId);
      const selected = Array.from(venueSelection);
      if (selected.length > 0) {
        await supabase.from("user_venue_access").insert(
          selected.map(venue_id => ({
            user_id: user.user_id,
            tenant_id: effectiveTenantId,
            venue_id,
          }))
        );
      }

      if (isApprover && !user.is_approver) {
        await supabase.from("forecast_approvers").insert({ user_id: user.user_id });
      } else if (!isApprover && user.is_approver) {
        await supabase.from("forecast_approvers").delete().eq("user_id", user.user_id);
      }

      await logAuditEvent({
        action: "update",
        entityType: "sales_record",
        entityId: user.user_id,
        details: {
          type: "user_access_change",
          target_user: user.email,
          changes: { position, status, isApprover, pages, venue_ids: selected },
        },
      });

      toast({ title: "Saved", description: `Permissions for ${user.display_name || user.email} updated.` });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="w-full max-w-2xl bg-background border-l border-border overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between z-10">
          <h2 className="font-display font-semibold text-lg">
            Edit User: <span className="text-primary">{user.email}</span>
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-6 space-y-8">
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Basic Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Position</label>
                <Select value={position} onValueChange={v => setPosition(v as UserPosition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={status} onValueChange={v => setStatus(v as UserStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch checked={isApprover} onCheckedChange={setIsApprover} />
                <span className="text-sm">Forecast Approver</span>
              </div>
            </div>
          </section>

          {/* Venue Access */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Venue Access</h3>
            <p className="text-[11px] text-muted-foreground">
              Which venues can this user see? Leave all unchecked to grant access to all venues.
            </p>
            <div className="border border-border rounded-lg p-3 space-y-2">
              {venues.length === 0 && (
                <div className="text-xs text-muted-foreground">No venues in this client.</div>
              )}
              {venues.map(v => (
                <label key={v.id} className="flex items-center gap-3 p-1.5 rounded-md hover:bg-muted/40 cursor-pointer">
                  <Checkbox
                    checked={venueSelection.has(v.id)}
                    onCheckedChange={() => toggleVenue(v.id)}
                  />
                  <span className="text-sm">{v.name}</span>
                </label>
              ))}
              {venueSelection.size === 0 && venues.length > 0 && (
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/60 mt-2">
                  No restrictions — user sees all venues.
                </div>
              )}
            </div>
          </section>

          {/* Page Access & Actions */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Page Access</h3>
            <div className="space-y-3">
              {ALL_PAGES.map(page => {
                const perm = pages.find(p => p.page_key === page.key)!;
                const actions = PAGE_ACTIONS[page.key] || [];
                return (
                  <div key={page.key} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{page.label}</span>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs">
                          <Switch
                            checked={perm.show_in_sidebar}
                            onCheckedChange={v => updatePage(page.key, "show_in_sidebar", v)}
                          />
                          Sidebar
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Switch
                            checked={perm.can_access}
                            onCheckedChange={v => updatePage(page.key, "can_access", v)}
                          />
                          Access
                        </label>
                      </div>
                    </div>
                    {perm.can_access && (
                      <div>
                        <label className="text-xs text-muted-foreground">Authority</label>
                        <Select value={perm.authority} onValueChange={v => updatePage(page.key, "authority", v)}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {AUTHORITIES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {perm.can_access && actions.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-1">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                          Hide actions
                        </div>
                        {actions.map(action => (
                          <label key={action.key} className="flex items-center gap-3 p-1 rounded-md hover:bg-muted/40 cursor-pointer">
                            <Checkbox
                              checked={perm.hidden_actions.includes(action.key)}
                              onCheckedChange={() => toggleAction(page.key, action.key)}
                            />
                            <span className="text-sm">{action.label}</span>
                            <span className="text-[10px] text-muted-foreground font-mono ml-auto">{action.key}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Save Bar */}
        <div className="sticky bottom-0 bg-background border-t border-border p-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
