import { VenueFilter } from "@/types/sales";

interface DashboardHeaderProps {
  venue: VenueFilter;
  onVenueChange: (v: VenueFilter) => void;
  onToggleUpload: () => void;
  onToggleManual: () => void;
}

const venues: VenueFilter[] = ["All Venues", "Assembly", "Caliente"];

const DashboardHeader = ({ venue, onVenueChange, onToggleUpload, onToggleManual }: DashboardHeaderProps) => {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">KHAMBU</span>
          <span className="text-muted-foreground ml-3 text-lg font-normal">Analytics</span>
        </h1>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {venues.map((v) => (
            <button
              key={v}
              onClick={() => onVenueChange(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                venue === v
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={onToggleUpload}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
        >
          Upload Data
        </button>
        <button
          onClick={onToggleManual}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
        >
          Manual Entry
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
