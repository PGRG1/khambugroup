-- Add unit_size to inventory_items for tracking per-unit volume/weight (e.g., "700ml", "3.5kg")
ALTER TABLE public.inventory_items ADD COLUMN unit_size text DEFAULT '' NOT NULL;