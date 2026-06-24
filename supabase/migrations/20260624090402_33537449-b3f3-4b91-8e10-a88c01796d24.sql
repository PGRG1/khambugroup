ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code text;

-- Backfill codes for suppliers that don't have one
WITH numbered AS (
  SELECT id,
         UPPER(SUBSTRING(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 1, 3)) AS base,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, UPPER(SUBSTRING(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 1, 3))
           ORDER BY name
         ) AS seq
  FROM public.suppliers
  WHERE code IS NULL OR code = ''
)
UPDATE public.suppliers s
SET code = n.base || '-' || LPAD(n.seq::text, 3, '0')
FROM numbered n
WHERE s.id = n.id;

-- Add unique constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_code_tenant_unique'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_code_tenant_unique UNIQUE (tenant_id, code);
  END IF;
END $$;