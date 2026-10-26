import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenues, type Venue } from "@/hooks/useVenues";
import {
  sanitizeScope, scopeFilterIds, scopeLabel, scopeReminder, toggleScopeVenue,
  venueScopeMode, venueScopeStorageKey, type VenueScope, type VenueScopeMode,
} from "@/utils/venueScope";

export interface VenueScopeValue {
  ready: boolean;
  /** Venues this user may see (active only). */
  venues: Venue[];
  scope: VenueScope;
  isAll: boolean;
  /** User can only see some venues. */
  restricted: boolean;
  /** User can see exactly one venue: no picker. */
  locked: boolean;
  allLabel: string;
  label: string;
  reminder: string;
  /** Ids to filter by; null = no filter. */
  filterIds: string[] | null;
  /** Venues currently in scope (all accessible ones when "all"). */
  selectedVenues: Venue[];
  selectedNames: string[];
  mode: VenueScopeMode;
  setScope: (s: VenueScope) => void;
  toggleVenue: (id: string) => void;
  reset: () => void;
  includesId: (id: string | null | undefined) => boolean;
  includesName: (name: string | null | undefined) => boolean;
}

const Ctx = createContext<VenueScopeValue | null>(null);

export function VenueScopeProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const { tenantId } = useActiveTenant();
  const { venues: allVenues, loading } = useVenues();
  const { pathname } = useLocation();
  const effectiveUserId = (isPreviewActive && isAdmin ? previewUserId : user?.id) || null;
  const bypass = isAdmin && !isPreviewActive;

  const [accessIds, setAccessIds] = useState<string[] | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAccessReady(false);
    if (!effectiveUserId || !tenantId || bypass) { setAccessIds(null); setAccessReady(true); return; }
    supabase.from("user_venue_access").select("venue_id").eq("user_id", effectiveUserId).eq("tenant_id", tenantId)
      .then(({ data }) => {
        if (cancelled) return;
        const ids = (data ?? []).map((r: any) => r.venue_id).filter(Boolean);
        setAccessIds(ids.length ? ids : null); // no rows = all venues (existing convention)
        setAccessReady(true);
      });
    return () => { cancelled = true; };
  }, [effectiveUserId, tenantId, bypass]);

  const venues = useMemo(
    () => allVenues.filter((v) => v.is_active && (!accessIds || accessIds.includes(v.id))),
    [allVenues, accessIds],
  );
  const allowedIds = useMemo(() => venues.map((v) => v.id), [venues]);
  const restricted = !!accessIds && allowedIds.length < allVenues.filter((v) => v.is_active).length;
  const locked = allowedIds.length === 1;
  const ready = !loading && accessReady;

  const key = effectiveUserId && tenantId ? venueScopeStorageKey(effectiveUserId, tenantId) : null;
  const [scope, setScopeState] = useState<VenueScope>("all");

  // Load (and sanitise) per user + tenant; switching tenant swaps the key.
  useEffect(() => {
    if (!key || !ready) { setScopeState("all"); return; }
    let raw: unknown = null;
    try { raw = JSON.parse(localStorage.getItem(key) || "null"); } catch { raw = null; }
    const next = locked ? [allowedIds[0]] : sanitizeScope(raw, allowedIds);
    setScopeState(next);
    if (!locked && next === "all") { try { localStorage.removeItem(key); } catch { /* ignore */ } }
  }, [key, ready, allowedIds, locked]);

  const setScope = useCallback((s: VenueScope) => {
    if (locked) return;
    const clean = s === "all" ? "all" : sanitizeScope(s, allowedIds);
    setScopeState(clean);
    if (key) { try { clean === "all" ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(clean)); } catch { /* ignore */ } }
  }, [key, allowedIds, locked]);

  const value = useMemo<VenueScopeValue>(() => {
    const allLabel = restricted ? "All my venues" : "All venues";
    const isAll = scope === "all";
    const filterIds = locked ? allowedIds : scopeFilterIds(scope, allowedIds, restricted);
    const selectedVenues = filterIds ? venues.filter((v) => filterIds.includes(v.id)) : venues;
    const selectedNames = selectedVenues.map((v) => v.name);
    const lowerNames = new Set(selectedNames.map((n) => n.trim().toLowerCase()));
    return {
      ready, venues, scope, isAll: locked ? false : isAll, restricted, locked, allLabel,
      label: scopeLabel(scope, venues, allLabel),
      reminder: locked ? "" : scopeReminder(scope, venues),
      filterIds, selectedVenues, selectedNames,
      mode: venueScopeMode(pathname),
      setScope,
      toggleVenue: (id) => setScope(toggleScopeVenue(scope, id, allowedIds)),
      reset: () => setScope("all"),
      includesId: (id) => !filterIds || (!!id && filterIds.includes(id)),
      includesName: (name) => !filterIds || (!!name && lowerNames.has(name.trim().toLowerCase())),
    };
  }, [ready, venues, scope, restricted, locked, allowedIds, pathname, setScope]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK: VenueScopeValue = {
  ready: true, venues: [], scope: "all", isAll: true, restricted: false, locked: false, allLabel: "All venues",
  label: "All venues", reminder: "", filterIds: null, selectedVenues: [], selectedNames: [], mode: "off",
  setScope: () => {}, toggleVenue: () => {}, reset: () => {}, includesId: () => true, includesName: () => true,
};

/** Shared venue scope. Outside the tenant layout it behaves as "all venues". */
export function useVenueScope(): VenueScopeValue {
  return useContext(Ctx) ?? FALLBACK;
}
