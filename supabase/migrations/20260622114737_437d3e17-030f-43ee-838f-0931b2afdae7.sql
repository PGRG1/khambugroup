
ALTER TABLE public.goods_received_notes
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-00000000beef';

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-00000000beef';

CREATE INDEX IF NOT EXISTS idx_grn_tenant ON public.goods_received_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_tenant ON public.grn_items(tenant_id);
