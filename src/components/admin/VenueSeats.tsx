import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifySeatHistoryChanged, type SeatHistoryEntry } from "@/hooks/useSeatHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/utils/format";
import { iso } from "@/utils/revenueOverview";

/** Current seats, a "Change seats" form (number + From date) and earlier counts. */
export function VenueSeats({ venueId, tenantId, history, onSaved }: {
  venueId: string;
  tenantId: string | null;
  /** This venue's rows, newest first. */
  history: SeatHistoryEntry[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState("");
  const [from, setFrom] = useState(() => iso(new Date()));
  const [saving, setSaving] = useState(false);
  const today = iso(new Date());
  const current = history.find((h) => h.effective_from <= today) ?? null;
  const upcoming = history.filter((h) => h.effective_from > today);
  const earlier = history.filter((h) => h !== current && h.effective_from <= today);

  const save = async () => {
    const n = Number(seats);
    if (!Number.isInteger(n) || n <= 0) { toast({ title: "Enter a whole number of seats above 0", variant: "destructive" }); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { toast({ title: "Pick a From date", variant: "destructive" }); return; }
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase.from("venue_seat_history").upsert(
      { tenant_id: tenantId, venue_id: venueId, seats: n, effective_from: from, created_by: user?.id ?? null },
      { onConflict: "venue_id,effective_from" },
    );
    setSaving(false);
    if (error) { toast({ title: "Seats not saved", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Seats saved", description: `${n} seats from ${formatDate(from)}.` });
    setOpen(false); setSeats("");
    notifySeatHistoryChanged();
    onSaved();
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Seats:</span>
        <span className="font-medium text-foreground td-num">{current ? current.seats : "Seats not set"}</span>
        {current && <span className="text-muted-foreground">since {formatDate(current.effective_from)}</span>}
        {!open && <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>Change seats</Button>}
      </div>
      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-2">
          <label className="text-[11px] text-muted-foreground">New number
            <Input type="number" min={1} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} className="mt-0.5 h-9 w-24" autoFocus />
          </label>
          <label className="text-[11px] text-muted-foreground">From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 h-9 w-40" />
          </label>
          <Button size="sm" className="h-9" onClick={save} disabled={saving || !seats.trim()}>{saving ? "Saving…" : "Save"}</Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      )}
      {(upcoming.length > 0 || earlier.length > 0) && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {upcoming.map((h) => <li key={h.id}>{h.seats} seats from {formatDate(h.effective_from)} (coming up)</li>)}
          {earlier.map((h) => <li key={h.id}>Earlier: {h.seats} seats from {formatDate(h.effective_from)}</li>)}
        </ul>
      )}
    </div>
  );
}
