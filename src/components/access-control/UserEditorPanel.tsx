import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/utils/auditLog";
import {
  ALL_PAGES, PAGE_ACTIONS, POSITIONS, AUTHORITIES,
  type UserAccessRecord, type UserPosition, type UserStatus, type Authority, type PageKey,
} from "@/utils/permissions";

interface Props {
  user: UserAccessRecord;
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditorPanel({ user, onClose, onSaved }: Props) {
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
  const [saving, setSaving] = useState(false);
  const [selectedPageForActions, setSelectedPageForActions] = useState<PageKey>("revenue");

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

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update display name
      await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.user_id);

      // Update access control
      await supabase.from("user_access_control").update({ position, status }).eq("user_id", user.user_id);

      // Update page permissions
      for (const p of pages) {
        await supabase.from("user_page_permissions").upsert({
          user_id: user.user_id,
          page_key: p.page_key,
          show_in_sidebar: p.show_in_sidebar,
          can_access: p.can_access,
          authority: p.authority,
          hidden_actions: p.hidden_actions,
        }, { onConflict: "user_id,page_key" });
      }

      // Handle approver toggle
      if (isApprover && !user.is_approver) {
        await supabase.from("forecast_approvers").insert({ user_id: user.user_id });
      } else if (!isApprover && user.is_approver) {
        await supabase.from("forecast_approvers").delete().eq("user_id", user.user_id);
      }

      // Audit log
      await logAuditEvent({
        action: "update",
        entityType: "sales_record", // reusing existing type
        entityId: user.user_id,
        details: {
          type: "user_access_change",
          target_user: user.email,
          changes: { position, status, isApprover, pages },
        },
      });

      toast({ title: "Saved", description: `Permissions for ${user.display_name || user.email} updated.` });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const currentPageActions = PAGE_ACTIONS[selectedPageForActions] || [];
  const currentPagePerms = pages.find(p => p.page_key === selectedPageForActions);

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

          {/* Page Access */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Page Access</h3>
            <div className="space-y-3">
              {ALL_PAGES.map(page => {
                const perm = pages.find(p => p.page_key === page.key)!;
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
                  </div>
                );
              })}
            </div>
          </section>

          {/* Hidden Actions */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Functions / Buttons to Hide</h3>
            <Select value={selectedPageForActions} onValueChange={v => setSelectedPageForActions(v as PageKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_PAGES.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="space-y-2 mt-2">
              {currentPageActions.map(action => (
                <label key={action.key} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={currentPagePerms?.hidden_actions.includes(action.key) || false}
                    onCheckedChange={() => toggleAction(selectedPageForActions, action.key)}
                  />
                  <span className="text-sm">{action.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">{action.key}</span>
                </label>
              ))}
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
