# Project Architecture Rules

- All invoice-scanner product links must use `buildMatchLinkPatch`; this keeps supplier-specific Items Master display/save fields atomic while preserving scanned matching evidence.
- Scanner price updates must write the linked supplier entry first and synchronize canonical item cost fields from that supplier conversion; prices are supplier-specific.- "Your Finance Team" figures come only from `supabase/functions/_shared/financeTeamReview.ts`; the `finance-team` function may use AI to word those facts but must reject output with unknown numbers or finding keys, so reviews stay grounded.
- Finance team review snapshots are written only by the `finance-team` function (service role) and are locked by a trigger once finished; history must never be edited.
