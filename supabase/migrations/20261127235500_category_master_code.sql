-- Product SKUs start with a fixed prefix for the item's Level 1 category (FOD-0001, BEV-0001…). The prefix lives in
-- Bani's master list so every client gets the same ones; a client's own Level 1 uses the first 3 letters of its name.
ALTER TABLE public.category_master ADD COLUMN IF NOT EXISTS code text;
UPDATE public.category_master SET code = CASE name
  WHEN 'Food' THEN 'FOD' WHEN 'Beverages' THEN 'BEV' WHEN 'Tobacco' THEN 'TOB' WHEN 'Supplies' THEN 'SUP'
  WHEN 'Operating Services' THEN 'OPS' WHEN 'Deposits' THEN 'DEP' WHEN 'Supplier Refunds' THEN 'REF' WHEN 'Adjustments' THEN 'ADJ' END
WHERE level = 1 AND code IS NULL;
