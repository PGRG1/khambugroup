import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVenueAllocationProfiles } from "@/hooks/useVenueAllocationProfiles";
import { useVenues } from "@/hooks/useVenues";
import { Info } from "lucide-react";

interface Props {
  /** 'home' = post everything to primary venue. 'profile' = split by profile. */
  mode: string | null | undefined;
  profileId: string | null | undefined;
  onChange: (mode: string, profileId: string | null) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Cost allocation picker — a REPORTING-only overlay used by both employees and
 * expense bills. Never affects journals, TB, or entity-level P&L.
 */
export function AllocationProfilePicker({ mode, profileId, onChange, className, compact }: Props) {
  const { profiles, linesFor, loading } = useVenueAllocationProfiles();
  const { venues } = useVenues();
  const venueName = (id: string) => venues.find(v => v.id === id)?.name || "?";
  const active = profiles.filter(p => p.is_active);
  const effMode = mode || "home";
  const currentLines = profileId ? linesFor(profileId) : [];

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {!compact && (
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Cost allocation
            </label>
          )}
          <Select
            value={effMode}
            onValueChange={(v) => onChange(v, v === "profile" ? profileId ?? null : null)}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="home">Primary venue only</SelectItem>
              <SelectItem value="profile">Split by profile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          {!compact && (
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Profile
            </label>
          )}
          <Select
            value={profileId || ""}
            onValueChange={(v) => onChange("profile", v || null)}
            disabled={effMode !== "profile" || loading}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={active.length ? "Select profile…" : "No profiles yet"} />
            </SelectTrigger>
            <SelectContent>
              {active.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {effMode === "profile" && currentLines.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
          {currentLines.map(l => `${venueName(l.venue_id)} ${Number(l.percent).toFixed(0)}%`).join(" · ")}
        </p>
      )}
      {!compact && (
        <p className="mt-1 text-[11px] text-muted-foreground/80 inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Reporting overlay only — no effect on journals or entity P&L.{" "}
          <Link to="/admin/allocation-profiles" className="underline hover:text-primary">Manage profiles</Link>
        </p>
      )}
    </div>
  );
}
