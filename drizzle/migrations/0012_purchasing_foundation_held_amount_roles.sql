ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS held_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS purchasing_role text;
ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_purchasing_role_check CHECK (purchasing_role IN ('staff','manager','owner'));

CREATE UNIQUE INDEX IF NOT EXISTS goods_received_notes_one_per_invoice ON public.goods_received_notes (invoice_id) WHERE invoice_id IS NOT NULL;

-- Backfill held amounts on existing Disputed invoices: sum over lines of
-- max(0, invoiced amount - accepted amount), using accepted_qty/accepted_price where present.
UPDATE public.invoices i
SET held_amount = COALESCE((
  SELECT SUM(GREATEST(0,
    COALESCE(l.total, COALESCE(l.quantity,0) * COALESCE(l.unit_price,0))
    - COALESCE(l.accepted_qty, l.quantity, 0) * COALESCE(l.accepted_price, l.unit_price, 0)
  ))
  FROM public.invoice_line_items l
  WHERE l.invoice_id = i.id
), 0)
WHERE i.review_status = 'Disputed';

-- Backfill purchasing roles per tenant: tenant_admin -> owner; members with a
-- global 'manager' role -> manager; other members -> staff; platform_admin stays null.
UPDATE public.tenant_members SET purchasing_role = 'owner' WHERE role = 'tenant_admin';
UPDATE public.tenant_members tm SET purchasing_role = 'manager'
  WHERE tm.role = 'member' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = tm.user_id AND ur.role = 'manager');
UPDATE public.tenant_members SET purchasing_role = 'staff' WHERE role = 'member' AND purchasing_role IS NULL;