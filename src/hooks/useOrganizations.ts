import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface Organization {
  id: string;
  tenant_id: string;
  name: string;
  legal_name: string | null;
  registration_number: string | null;
  incorporation_date: string | null;
  registered_address: string | null;
  auditor: string | null;
  created_at: string;
  updated_at: string;
}

export type OrgInput = Partial<Omit<Organization, "id" | "tenant_id" | "created_at" | "updated_at">> & { name: string };

export function useOrganizations() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setOrganizations([]); setLoading(false); return; }
    setLoading(true);
    // Explicit .range() guards against any accidental single-row default and
    // makes it obvious in devtools when the query is capped.
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name")
      .range(0, 999);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[useOrganizations] load failed", { tenantId, error });
      toast({ title: "Failed to load organizations", description: error.message, variant: "destructive" });
      setOrganizations([]);
    } else {
      const rows = (data ?? []) as Organization[];
      // eslint-disable-next-line no-console
      console.debug("[useOrganizations] loaded", { tenantId, count: rows.length, names: rows.map((r) => r.name) });
      setOrganizations(rows);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (tenantLoading) return;
    load();
  }, [load, tenantLoading]);

  const create = async (input: OrgInput) => {
    if (!tenantId) return false;
    const name = input.name?.trim();
    if (!name) { toast({ title: "Name is required", variant: "destructive" }); return false; }
    const { error } = await supabase.from("organizations").insert({ ...input, name, tenant_id: tenantId });
    if (error) { toast({ title: "Could not add organization", description: error.message, variant: "destructive" }); return false; }
    await load();
    return true;
  };

  const update = async (id: string, patch: Partial<Organization>) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("organizations").update(patch).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return false; }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("organizations").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Cannot delete organization", description: error.message, variant: "destructive" }); return false; }
    await load();
    return true;
  };

  return { organizations, loading, reload: load, create, update, remove };
}
