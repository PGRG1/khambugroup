import { useVenuesConfig } from "@/hooks/useVenuesConfig";
import { Switch } from "@/components/ui/switch";

const VenuesConfigPanel = () => {
  const { venues, loading, updateVenue } = useVenuesConfig();

  return (
    <div className="card-glass rounded-xl p-6">
      <h2 className="text-lg font-display font-semibold text-foreground mb-1">Venues</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Control which venues appear in new sales entries and dashboards. Legacy venues remain in historical reports but are hidden from new entries.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => (
            <div key={v.name} className="py-3 px-4 rounded-lg border border-border bg-secondary/50 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{v.displayLabel}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {v.venueType} · {v.isActive ? "Active for new entries" : "Inactive for new entries"}
                    {v.historicalOnly && " · Historical only"}
                  </p>
                </div>
                <Switch
                  checked={v.isActive}
                  disabled={v.historicalOnly}
                  onCheckedChange={(checked) => updateVenue(v.name, { isActive: checked })}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <label className="flex items-center gap-2"><input type="checkbox" checked={v.includeInDashboard} onChange={(e) => updateVenue(v.name, { includeInDashboard: e.target.checked })} /> Dashboard</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={v.includeInForecasting} onChange={(e) => updateVenue(v.name, { includeInForecasting: e.target.checked })} /> Forecasting</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={v.includeInInventory} onChange={(e) => updateVenue(v.name, { includeInInventory: e.target.checked })} /> Inventory</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={v.includeInPayroll} onChange={(e) => updateVenue(v.name, { includeInPayroll: e.target.checked })} /> Payroll</label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VenuesConfigPanel;
