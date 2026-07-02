-- Remove any pre-existing 'kpis' rows that would collide with the rename
DELETE FROM public.user_page_permissions upp
WHERE upp.page_key = 'kpis'
  AND EXISTS (
    SELECT 1 FROM public.user_page_permissions dup
    WHERE dup.user_id = upp.user_id
      AND dup.tenant_id = upp.tenant_id
      AND dup.page_key = 'kpi-management'
  );

-- Rename old key to new key
UPDATE public.user_page_permissions
SET page_key = 'kpis'
WHERE page_key = 'kpi-management';

-- No-op idempotent statement (documented in spec)
UPDATE public.user_page_permissions
SET page_key = 'kpis'
WHERE page_key = 'kpis';