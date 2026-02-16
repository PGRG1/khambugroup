-- Add current stock quantity to inventory items
ALTER TABLE public.inventory_items ADD COLUMN current_qty numeric NOT NULL DEFAULT 0;