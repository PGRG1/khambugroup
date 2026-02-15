import { usePageVisibility } from "@/hooks/usePageVisibility";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  const { isAdmin } = useAuth();
  const { pages, loading, toggleVisibility } = usePageVisibility();

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">Settings</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Admin configuration</p>
      </div>

      <div className="card-glass rounded-xl p-6">
        <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2 mb-4">
          <SettingsIcon className="h-5 w-5 text-primary" />
          Page Visibility
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Control which pages are visible to non-admin users. Admins always see all pages.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3">
            {pages.map((page) => (
              <div
                key={page.page_key}
                className="flex items-center justify-between py-3 px-4 rounded-lg border border-border bg-secondary/50"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{page.page_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {page.visible_to_all ? "Visible to all users" : "Admin only"}
                  </p>
                </div>
                <Switch
                  checked={page.visible_to_all}
                  onCheckedChange={(checked) => toggleVisibility(page.page_key, checked)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
