/**
 * Pure helpers for the portal-wide venue scope (one picker for every page).
 * "all" means no venue filter (or, for venue-restricted users, all of their venues).
 */
export type VenueScope = "all" | string[];
export type VenueLite = { id: string; name: string };
export type VenueScopeMode = "split" | "none" | "off";

export function venueScopeStorageKey(userId: string, tenantId: string): string {
  return `bani.venueScope.${userId}.${tenantId}`;
}

/** Reset to "all" when any stored venue no longer exists or is no longer accessible. */
export function sanitizeScope(raw: unknown, allowedIds: string[]): VenueScope {
  if (!Array.isArray(raw) || raw.length === 0) return "all";
  const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === "string")));
  if (!ids.length || ids.some((id) => !allowedIds.includes(id))) return "all";
  if (allowedIds.length > 0 && ids.length === allowedIds.length) return "all";
  return ids;
}

/** Tick / untick one venue. Unticking the last one goes back to "all". */
export function toggleScopeVenue(scope: VenueScope, id: string, allowedIds: string[]): VenueScope {
  const cur = scope === "all" ? [] : scope;
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  if (next.length === 0) return "all";
  if (allowedIds.length > 0 && next.length === allowedIds.length && allowedIds.every((a) => next.includes(a))) return "all";
  return next;
}

/** Ids to filter queries by; null = no filter at all. */
export function scopeFilterIds(scope: VenueScope, allowedIds: string[], restricted: boolean): string[] | null {
  if (scope !== "all") return scope;
  return restricted ? allowedIds : null;
}

function orderedNames(scope: string[], venues: VenueLite[]): string[] {
  return venues.filter((v) => scope.includes(v.id)).map((v) => v.name);
}

/** Pill label: "All venues" · "Hanabi" · "Assembly + Caliente" · "3 venues". */
export function scopeLabel(scope: VenueScope, venues: VenueLite[], allLabel = "All venues"): string {
  if (scope === "all") return allLabel;
  const names = orderedNames(scope, venues);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names.length} venues`;
}

/** Page reminder: "Hanabi only" · "Assembly + Caliente" · "3 venues". */
export function scopeReminder(scope: VenueScope, venues: VenueLite[]): string {
  if (scope === "all") return "";
  const names = orderedNames(scope, venues);
  return names.length === 1 ? `${names[0]} only` : scopeLabel(scope, venues);
}

const NO_SPLIT = [
  "/finance", "/finance/books", "/finance/cash", "/bank", "/finance/journal", "/finance/ledger", "/finance/chart-of-accounts", "/finance/ledger-audit",
  "/finance/balance-sheet", "/finance/trial-balance", "/finance/cashflow-report", "/finance/pl-ledger",
];
const OFF = ["/assistant", "/activity-log", "/admin", "/user-access", "/notifications", "/platform", "/finance-team"];
const within = (p: string, r: string) => p === r || p.startsWith(`${r}/`);

/** Whether the current page can be split by venue. */
export function venueScopeMode(pathname: string): VenueScopeMode {
  if (pathname === "/finance/reports") return "split";
  if (NO_SPLIT.some((r) => within(pathname, r))) return "none";
  if (OFF.some((r) => within(pathname, r))) return "off";
  return "split";
}
