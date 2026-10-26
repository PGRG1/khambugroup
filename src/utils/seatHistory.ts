/**
 * Venue seat counts with history. A count applies from its `effective_from`
 * date until the next change. All seat-based numbers use the count that
 * applied on each trading day.
 */
export interface SeatHistoryRow {
  venue_id: string;
  seats: number;
  /** ISO date YYYY-MM-DD */
  effective_from: string;
}

/** Seats for one venue on one ISO date; null when none applied yet. */
export function seatsOn(rows: SeatHistoryRow[], venueId: string, date: string): number | null {
  let best: SeatHistoryRow | null = null;
  for (const r of rows) {
    if (r.venue_id !== venueId || r.effective_from > date) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best && best.seats > 0 ? best.seats : null;
}

/** Current (latest) seat count for a venue. */
export function currentSeats(rows: SeatHistoryRow[], venueId: string): number | null {
  return seatsOn(rows, venueId, "9999-12-31");
}

export interface SeatRecord { date: string; venue: string; totalSales: number; guests: number }

export interface SeatTotals {
  /** Σ over trading days of the seats that applied (only venue-days with seats). */
  seatDays: number;
  revenue: number;
  guests: number;
  days: number;
  /** Seats applying on the last trading day (sum across venues). */
  latestSeats: number | null;
}

/**
 * Seat economics for a set of sales records. Each venue-day contributes the
 * seat count that applied on that date; venue-days without seats are left out
 * (their revenue and guests too) so they cannot inflate per-seat numbers.
 */
export function seatTotals(
  records: SeatRecord[],
  rows: SeatHistoryRow[],
  venueIdByName: Map<string, string>,
): SeatTotals {
  const venueDays = new Map<string, { venueId: string; date: string; revenue: number; guests: number }>();
  for (const r of records) {
    const venueId = venueIdByName.get(r.venue);
    if (!venueId) continue;
    const key = `${venueId}|${r.date}`;
    const cur = venueDays.get(key) ?? { venueId, date: r.date, revenue: 0, guests: 0 };
    cur.revenue += r.totalSales;
    cur.guests += r.guests;
    venueDays.set(key, cur);
  }
  let seatDays = 0, revenue = 0, guests = 0;
  const days = new Set<string>();
  const seatsByDate = new Map<string, number>();
  for (const vd of venueDays.values()) {
    const s = seatsOn(rows, vd.venueId, vd.date);
    if (!s) continue;
    seatDays += s;
    revenue += vd.revenue;
    guests += vd.guests;
    days.add(vd.date);
    seatsByDate.set(vd.date, (seatsByDate.get(vd.date) ?? 0) + s);
  }
  const lastDate = [...seatsByDate.keys()].sort().pop();
  return { seatDays, revenue, guests, days: days.size, latestSeats: lastDate ? seatsByDate.get(lastDate)! : null };
}

/** Seats applying on a date summed across venues; null when none have seats. */
export function seatsForDate(rows: SeatHistoryRow[], venueIds: string[], date: string): number | null {
  let sum = 0;
  for (const id of venueIds) sum += seatsOn(rows, id, date) ?? 0;
  return sum > 0 ? sum : null;
}
