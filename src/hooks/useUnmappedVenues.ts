import { useMemo } from "react";
import { useAccountMapping } from "@/hooks/useAccountMapping";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useVenues } from "@/hooks/useVenues";

/**
 * Returns venues that are missing a `sales_revenue` mapping — the same
 * lookup rule AccountingMappingSummary uses. Tenant-scoped via the
 * underlying hooks (all three already call useActiveTenant).
 */
export function useUnmappedVenues() {
  const { items: rules, loading: rulesLoading } = useAccountMapping();
  const { items: accounts, loading: accLoading } = useChartOfAccounts();
  const { venues, loading: venuesLoading } = useVenues();

  const accountById = useMemo(() => {
    const m = new Map<string, boolean>();
    accounts.forEach((a) => m.set(a.id, true));
    return m;
  }, [accounts]);

  const unmapped = useMemo(() => {
    const lookup = (match_key: string) => {
      const r = rules.find((x) => x.rule_type === "sales_revenue" && x.match_key === match_key);
      if (!r) {
        const g = rules.find((x) => x.rule_type === "sales_revenue" && x.match_key === "");
        return g ? accountById.has(g.account_id) : false;
      }
      return accountById.has(r.account_id);
    };
    return venues.filter((v) => v.is_active).map((v) => v.name).filter((name) => !lookup(name));
  }, [rules, accountById, venues]);

  return {
    unmappedVenues: unmapped,
    unmappedCount: unmapped.length,
    loading: rulesLoading || accLoading || venuesLoading,
  };
}
