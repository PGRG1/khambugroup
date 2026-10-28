ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS needs_po boolean NOT NULL DEFAULT false;
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS issue text;
ALTER TABLE public.grn_items ADD CONSTRAINT grn_items_issue_check CHECK (issue IS NULL OR issue IN ('short','damaged','wrong_item'));