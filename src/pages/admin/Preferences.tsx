/**
 * /admin/preferences — Page visibility + Appearance.
 *
 * Page visibility is a tenant-level policy; appearance is a per-user setting
 * (the theme switcher stores locally). Kept together as the two "how the UI
 * behaves" toggles.
 */
import { Navigate } from "react-router-dom";
import { Eye, Palette } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { Switch } from "@/components/ui/switch";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { PageHeader } from "@/components/expenses/shared";

function SectionCard({
  icon: Icon, title, description, children,
}: { icon: typeof Eye; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
      <div className="p-5 border-b border-border/60 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary"/>
        </div>
        <div>
          <div className="text-base font-display font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function Preferences() {
  const { isAdmin } = useAuth();
  const { pages, loading, toggleVisibility } = usePageVisibility();
  if (!isAdmin) return <Navigate to="/" replace/>;

  return (
    <div className="p-6 space-y-6 max-w-[1100px] mx-auto">
      <PageHeader
        title="Preferences"
        description="Control which pages non-admin users can see, and personalise the interface."
      />

      <SectionCard icon={Eye} title="Page Visibility" description="Tenant policy — admins always see everything, regardless of these toggles.">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2">
            {pages.map((p) => (
              <div key={p.page_key} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border bg-secondary/40">
                <div>
                  <div className="text-sm font-medium">{p.page_label}</div>
                  <div className="text-xs text-muted-foreground">{p.visible_to_all ? "Visible to all users" : "Admin only"}</div>
                </div>
                <Switch checked={p.visible_to_all} onCheckedChange={(v) => toggleVisibility(p.page_key, v)}/>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Palette} title="Appearance" description="Per-user theme, stored locally on your device.">
        <ThemeSwitcher/>
      </SectionCard>
    </div>
  );
}
