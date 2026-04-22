-- Create product_categories table for L1/L2/L3 hierarchy
CREATE TABLE public.product_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  level int NOT NULL CHECK (level IN (1, 2, 3)),
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- L1 must have null parent; L2/L3 must have a parent
CREATE OR REPLACE FUNCTION public.validate_product_category_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.level = 1 AND NEW.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'L1 categories must have null parent_id';
  END IF;
  IF NEW.level IN (2, 3) AND NEW.parent_id IS NULL THEN
    RAISE EXCEPTION 'L% categories require a parent_id', NEW.level;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_product_category_parent
BEFORE INSERT OR UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.validate_product_category_parent();

CREATE TRIGGER trg_product_categories_updated_at
BEFORE UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Unique sibling names (case-insensitive). Two partial indexes to handle null parent_id.
CREATE UNIQUE INDEX product_categories_unique_root
  ON public.product_categories (lower(name))
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX product_categories_unique_child
  ON public.product_categories (parent_id, lower(name))
  WHERE parent_id IS NOT NULL;

CREATE INDEX product_categories_parent_idx ON public.product_categories (parent_id);
CREATE INDEX product_categories_level_idx ON public.product_categories (level);

-- RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read product_categories"
  ON public.product_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized can manage product_categories"
  ON public.product_categories FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));