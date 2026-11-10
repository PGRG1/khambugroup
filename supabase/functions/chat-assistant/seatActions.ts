// Customer seats through a Bani confirmation card. Proposal reads the current
// count and validates venue, number and date; Confirm saves it as the signed-in
// user (RLS), the same way Settings does (venue_seat_history; a trigger syncs venues.seats).

const hkToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });

/** Current seats per active venue: latest history row in effect, else the venue's own count. */
export async function currentSeats(admin: any, tenantId: string) {
  const today = hkToday();
  const { data: venues } = await admin.from("venues").select("id,name,seats").eq("tenant_id", tenantId).eq("is_active", true);
  const { data: rows } = await admin.from("venue_seat_history").select("venue_id,seats,effective_from")
    .eq("tenant_id", tenantId).lte("effective_from", today).order("effective_from", { ascending: false });
  return ((venues ?? []) as any[]).map((v) => {
    const h = ((rows ?? []) as any[]).find((r) => r.venue_id === v.id);
    const seats = h ? Number(h.seats) : v.seats == null ? null : Number(v.seats);
    return { id: v.id as string, name: v.name as string, seats, since: h?.effective_from ?? null };
  });
}

/** Pure checks, so they can be tested without a database. */
export function checkSeatArgs(args: any, venues: { name: string }[], today: string) {
  const name = typeof args.venue === "string" ? args.venue.trim().toLowerCase() : "";
  const venue = name ? venues.find((v) => v.name.toLowerCase() === name) : venues.length === 1 ? venues[0] : undefined;
  const seats = Number(args.seats);
  const from = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : today;
  if (!venue) return { ok: false as const, error: name ? "No venue with that name." : "Which venue?" };
  if (!Number.isInteger(seats) || seats <= 0 || seats > 5000) return { ok: false as const, error: "Ask for the new number of customer seats (a whole number above 0)." };
  return { ok: true as const, venue, seats, from };
}

export async function proposeSeats(args: any, admin: any, tenantId: string, userId: string) {
  const venues = await currentSeats(admin, tenantId);
  const now = venues.map((v) => ({ venue: v.name, seats: v.seats, since: v.since }));
  const c = checkSeatArgs(args, venues, hkToday());
  if (!c.ok) return { ok: false, error: c.error, current_seats: now, note: "No card was created. Tell the user the current seats first, then ask only for what is missing." };
  const v = c.venue as (typeof venues)[number];
  if (v.seats === c.seats) return { ok: false, error: `${v.name} already has ${c.seats} seats. Nothing to change.` };
  const title = `${v.name}: ${v.seats ?? "no"} → ${c.seats} seats`;
  const detail = `Confirm saves ${c.seats} customer seats for ${v.name} from ${c.from}, same as Settings.`;
  const payload = { venue_id: v.id, venue_name: v.name, seats: c.seats, from: c.from, before: v.seats };
  const { data: row, error } = await admin.from("bani_pending_actions")
    .insert({ tenant_id: tenantId, user_id: userId, kind: "set_venue_seats", title, detail, payload }).select("id").single();
  if (error || !row) return { ok: false, error: "Could not create the action card." };
  return { ok: true, action_id: (row as any).id, title, detail, note: "Seats card shown. Say in one line what Confirm will save; do not claim it is done." };
}

export async function confirmSeats(p: any, uc: any, tenantId: string, userId: string) {
  const { error } = await uc.from("venue_seat_history").upsert(
    { tenant_id: tenantId, venue_id: p.venue_id, seats: p.seats, effective_from: p.from, created_by: userId },
    { onConflict: "venue_id,effective_from" },
  );
  if (error) return { status: 403, body: { error: "You don't have permission to change seats, or saving failed. Nothing was changed." } };
  return { status: 200, body: { ok: true, message: `Done. ${p.venue_name} now has ${p.seats} seats from ${p.from}.` } };
}