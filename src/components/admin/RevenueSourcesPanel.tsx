import { useState } from "react";
import { useRevenueSources } from "@/hooks/useRevenueSources";
import { Plus, X, Trash2, Check } from "lucide-react";

const RevenueSourcesPanel = () => {
  const { sources, loading, addSource, updateSource, deleteSource } = useRevenueSources();
  const [newName, setNewName] = useState("");

  return (
    <div className="card-glass rounded-xl p-6">
      <h2 className="text-lg font-display font-semibold text-foreground mb-1">Revenue Sources</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Configure the list of revenue sources used in sales entries and dashboards.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          placeholder="New revenue source"
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={async () => {
            const trimmed = newName.trim();
            if (!trimmed) return;
            const ok = await addSource(trimmed);
            if (ok) setNewName("");
          }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border bg-secondary/50">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.isDefault ? "Default" : "Optional"} · {s.isActive ? "Active" : "Inactive"}
                </p>
              </div>
              <button
                title={s.isDefault ? "Default" : "Set as default"}
                onClick={() => updateSource(s.id, { isDefault: !s.isDefault })}
                className={`p-1.5 rounded-md transition-colors ${s.isDefault ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                title={s.isActive ? "Deactivate" : "Activate"}
                onClick={() => updateSource(s.id, { isActive: !s.isActive })}
                className="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted"
              >
                {s.isActive ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSource(s.id); }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RevenueSourcesPanel;
