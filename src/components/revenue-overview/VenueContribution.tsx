import { SalesRecord, VenueFilter } from "@/types/sales";
import { fmtHKD, fmtNum, pctDelta } from "./utils";
import { DeltaChip } from "./DeltaChip";
import { getVenueSeats } from "@/constants/venueSeating";

interface Props {
  data: SalesRecord[];
  prevData: SalesRecord[];
  venue: VenueFilter;
  seatingKey: number;
}

export function VenueContribution({ data, prevData, venue, seatingKey }: Props) {
  if (venue === "All Venues") {
    const map = new Map<string, { revenue: number; guests: number }>();
    for (const r of data) {
      const c = map.get(r.venue) ?? { revenue: 0, guests: 0 };
      c.revenue += r.totalSales;
      c.guests += r.guests;
      map.set(r.venue, c);
    }
    const rows = [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
    const total = rows.reduce((s, r) => s + r.revenue, 0) || 1;
    const max = rows[0]?.revenue || 1;

    return (
      <div className="card-glass rounded-xl border border-border/60 p-4">
        <div className="text-[13px] font-medium mb-3">Venue Contribution</div>
        <div className="space-y-3">
          {rows.map((r) => {
            const share = (r.revenue / total) * 100;
            const bar = (r.revenue / max) * 100;
            const spg = r.guests ? r.revenue / r.guests : 0;
            return (
              <div key={r.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{r.name}</span>
                  <div className="text-[12px] tabular-nums">
                    <span className="font-semibold">HK${fmtHKD(r.revenue, true)}</span>
                    <span className="text-muted-foreground ml-2">{share.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-1 h-3 rounded-sm bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary/80 rounded-sm"
                    style={{ width: `${bar}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  {fmtNum(r.guests)} covers · HK${fmtHKD(spg)}/guest
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="text-[12px] text-muted-foreground">No data.</div>}
        </div>
      </div>
    );
  }

  // Single-venue: seat economics
  const seats = getVenueSeats(venue) ?? null;
  const days = new Set(data.map((r) => r.date)).size || 1;
  const prevDays = new Set(prevData.map((r) => r.date)).size || 1;
  const revenue = data.reduce((s, r) => s + r.totalSales, 0);
  const guests = data.reduce((s, r) => s + r.guests, 0);
  const prevRevenue = prevData.reduce((s, r) => s + r.totalSales, 0);
  const prevGuests = prevData.reduce((s, r) => s + r.guests, 0);

  const revPerSeat = seats ? revenue / seats / days : null;
  const prevRevPerSeat = seats && prevData.length ? prevRevenue / seats / prevDays : null;
  const turns = seats ? guests / seats / days : null;
  const prevTurns = seats && prevData.length ? prevGuests / seats / prevDays : null;
  const spg = guests ? revenue / guests : 0;
  const prevSpg = prevGuests ? prevRevenue / prevGuests : 0;

  const Row = ({ label, value, delta, sub }: { label: string; value: string; delta: number | null; sub?: string }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div>
        <div className="text-[13px]">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[16px] font-semibold tabular-nums">{value}</span>
        <DeltaChip value={delta} suffix="" />
      </div>
    </div>
  );

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[13px] font-medium">Seat Economics</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {seats ? `${seats} seats` : "No seats set"}
        </div>
      </div>
      {seats ? (
        <>
          <Row
            label="Revenue / seat / day"
            value={`HK$${fmtHKD(revPerSeat ?? 0)}`}
            delta={prevRevPerSeat ? pctDelta(revPerSeat ?? 0, prevRevPerSeat) : null}
          />
          <Row
            label="Turns / seat / day"
            value={(turns ?? 0).toFixed(2)}
            delta={prevTurns ? pctDelta(turns ?? 0, prevTurns) : null}
            sub="Covers per seat"
          />
          <Row
            label="Avg spend / guest"
            value={`HK$${fmtHKD(spg)}`}
            delta={prevSpg ? pctDelta(spg, prevSpg) : null}
          />
        </>
      ) : (
        <div className="text-[12px] text-muted-foreground py-4">
          Configure seat count for {venue} in the Seats editor.
        </div>
      )}
      {/* seatingKey ensures re-render */}
      <input type="hidden" value={seatingKey} />
    </div>
  );
}
