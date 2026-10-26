import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useVenueClosures } from "@/hooks/useVenueClosures";
import { weekdayName } from "@/utils/venueClosures";
import { formatDate } from "@/utils/format";

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Per-venue "Regular closures": every weekday or a date range. */
export function VenueClosureRules({ venueId }: { venueId: string }) {
  const { rules, addRule, removeRule } = useVenueClosures([venueId]);
  const [adding, setAdding] = useState<null | "weekday" | "range">(null);
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const save = async () => {
    if (adding === "range" && (!end || end < start)) { toast.error("Pick an end date on or after the start date."); return; }
    const ok = await addRule({ venue_id: venueId, weekday: adding === "weekday" ? weekday : null, start_date: start, end_date: adding === "range" ? end : null, reason: reason.trim() || null });
    if (ok) { setAdding(null); setReason(""); setEnd(""); } else toast.error("Couldn't save. Only admins and managers with access to this venue can.");
  };

  return (
    <div className="mt-2 space-y-1 text-xs">
      <div className="text-muted-foreground font-medium">Regular closures</div>
      {rules.length === 0 && !adding && <div className="text-muted-foreground">None</div>}
      {rules.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span>{r.weekday != null ? `Every ${weekdayName(r.weekday)} from ${formatDate(r.start_date)}` : `${formatDate(r.start_date)} – ${formatDate(r.end_date!)}`}{r.reason ? ` · ${r.reason}` : ""}</span>
          <button type="button" aria-label="Remove closure" className="text-muted-foreground hover:text-foreground" onClick={() => removeRule(r.id)}><X className="h-3 w-3" /></button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {adding === "weekday" ? (
            <select aria-label="Weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2">
              {DAYS.map((d) => <option key={d} value={d}>Every {weekdayName(d)}</option>)}
            </select>
          ) : null}
          <Input type="date" aria-label={adding === "weekday" ? "Starting" : "From"} value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-36" />
          {adding === "range" && <Input type="date" aria-label="To" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-36" />}
          <Input placeholder="Reason (optional)" value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} className="h-8 w-40" />
          <Button size="sm" className="h-8" onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setAdding(null)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button type="button" className="text-primary hover:underline" onClick={() => setAdding("weekday")}>Add every-weekday</button>
          <button type="button" className="text-primary hover:underline" onClick={() => setAdding("range")}>Add date range</button>
        </div>
      )}
    </div>
  );
}
