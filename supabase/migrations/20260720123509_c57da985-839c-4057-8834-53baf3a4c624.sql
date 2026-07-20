-- ============================================================================
-- GUARDRAIL MIGRATION: Prevent double-posting of auto-derived journal entries
-- ============================================================================
-- Context: Legacy code path posted revenue under source_type='sales' in
-- parallel with the canonical 'sales_summary' path, doubling revenue for
-- Oct 2025–May 2026 on KHAMBU. All legacy 'sales' entries have since been
-- voided. These constraints ensure the class of bug cannot recur, regardless
-- of what application code (current or future) tries to insert.
--
-- Revenue rule of record:
--   The operations `sales_records` table is the single source of truth for
--   revenue. Revenue journal entries must only be created via the
--   `rebuild_journal_from_operations` path with source_type='sales_summary'
--   (one entry per date+venue, source_id='YYYY-MM-DD__venue').
--
-- Pre-check results (verified before this migration):
--   - Only tenant 00000000-0000-0000-0000-00000000beef (KHAMBU) has any
--     source_type='sales' entries — 450 rows, all status='void'.
--   - Zero live (non-void) duplicates exist on
--     (tenant_id, source_type, source_id) across ANY tenant for auto-derived
--     sources. Safe to create the unique index cleanly.
-- ============================================================================

-- ─── GUARDRAIL 1: Retire 'sales' source_type ──────────────────────────────
-- Allow existing voided 'sales' rows to remain (historical audit trail).
-- Block any NEW insert with source_type='sales', and block any status change
-- that would revive a voided 'sales' entry back to a live status.
CREATE OR REPLACE FUNCTION public.block_retired_sales_source()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_type = 'sales' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'source_type "sales" is retired — use "sales_summary" for revenue postings (see rebuild_journal_from_operations).';
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM 'void' THEN
      RAISE EXCEPTION 'source_type "sales" is retired — existing rows may remain voided but cannot be revived. Use "sales_summary".';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_retired_sales_source ON public.journal_entries;
CREATE TRIGGER trg_block_retired_sales_source
BEFORE INSERT OR UPDATE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.block_retired_sales_source();

-- ─── GUARDRAIL 2: Physical uniqueness for auto-derived entries ────────────
-- One live journal entry per (tenant, source_type, source_id).
-- Excludes 'manual' entries (no source_id) and voided entries (so voiding
-- and re-posting still works).
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_live_source
  ON public.journal_entries (tenant_id, source_type, source_id)
  WHERE source_type <> 'manual'
    AND source_id IS NOT NULL
    AND source_id <> ''
    AND status <> 'void';

COMMENT ON INDEX public.uq_journal_entries_live_source IS
  'Prevents double-posting of auto-derived journal entries. Every automated source (sales_summary, invoice, settlement_clearing, expense_bill, bank_fee, payroll_accrual) must have at most one live entry per source document. Void the old before re-posting.';

COMMENT ON TRIGGER trg_block_retired_sales_source ON public.journal_entries IS
  'Retires the legacy source_type=''sales'' path. All revenue must post via source_type=''sales_summary'' (see rebuild_journal_from_operations).';