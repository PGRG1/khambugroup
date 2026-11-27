-- One master units list (Recipe · Stock · Buying units) kept by Bani and shared by every client, like the master
-- categories. Each client's uom_options holds the master rows (master_id set) plus its own additions (master_id null).
-- Products keep their units; nothing about existing products changes.

-- 1. Unit codes were unique across all clients by mistake (a second client could not add "kg"); make them unique per client.
ALTER TABLE public.uom_options DROP CONSTRAINT IF EXISTS uom_options_code_uom_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS uom_options_tenant_code_type ON public.uom_options (tenant_id, code, uom_type);

-- 2. The master list.
CREATE TABLE IF NOT EXISTS public.unit_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 20),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  uom_type text NOT NULL CHECK (uom_type IN ('base','stock','purchase')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, uom_type)
);
ALTER TABLE public.unit_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unit master readable" ON public.unit_master;
CREATE POLICY "unit master readable" ON public.unit_master FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.unit_master FROM anon, authenticated;

ALTER TABLE public.uom_options ADD COLUMN IF NOT EXISTS master_id uuid REFERENCES public.unit_master(id) ON DELETE SET NULL;

-- 3. First master list: KHAMBU's current units, unchanged.
INSERT INTO public.unit_master (code, label, uom_type, sort_order)
SELECT code, label, uom_type, sort_order FROM public.uom_options
 WHERE tenant_id = '00000000-0000-0000-0000-00000000beef' AND is_active
ON CONFLICT (code, uom_type) DO NOTHING;

-- 4. Give a client every master unit it does not have yet, linking units it already has by code.
CREATE OR REPLACE FUNCTION public._sync_tenant_units(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Units the client already has with the same code: link them (label follows the master).
  UPDATE public.uom_options o SET master_id = m.id, label = m.label, updated_at = now()
    FROM public.unit_master m
   WHERE o.tenant_id = p_tenant AND m.is_active AND o.code = m.code AND o.uom_type = m.uom_type
     AND o.master_id IS DISTINCT FROM m.id;
  -- Linked units follow a renamed master.
  UPDATE public.uom_options o SET label = m.label, updated_at = now()
    FROM public.unit_master m
   WHERE o.tenant_id = p_tenant AND o.master_id = m.id AND o.label <> m.label;
  -- Missing master units are added.
  INSERT INTO public.uom_options (tenant_id, code, label, uom_type, sort_order, is_active, master_id)
  SELECT p_tenant, m.code, m.label, m.uom_type, m.sort_order, true, m.id
    FROM public.unit_master m
   WHERE m.is_active
     AND NOT EXISTS (SELECT 1 FROM public.uom_options o WHERE o.tenant_id = p_tenant AND o.code = m.code AND o.uom_type = m.uom_type);
END
$function$;
REVOKE ALL ON FUNCTION public._sync_tenant_units(uuid) FROM PUBLIC, anon, authenticated;

DO $sync$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE coalesce(status, '') <> 'internal' LOOP
    PERFORM public._sync_tenant_units(t.id);
  END LOOP;
END
$sync$;

-- New clients get the master units too.
CREATE OR REPLACE FUNCTION public._tenant_units_on_create() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN IF coalesce(NEW.status, '') <> 'internal' THEN PERFORM public._sync_tenant_units(NEW.id); END IF; RETURN NEW; END $function$;
REVOKE ALL ON FUNCTION public._tenant_units_on_create() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tenants_master_units ON public.tenants;
CREATE TRIGGER tenants_master_units AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public._tenant_units_on_create();

-- 5. Bani changes the master list; every client follows. A removed master unit is hidden for every client
--    (products that use it keep it).
CREATE OR REPLACE FUNCTION public.save_master_unit(p_id uuid, p_code text, p_label text, p_type text, p_active boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid := p_id; t record;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Only Bani can change the master units'; END IF;
  IF btrim(coalesce(p_label, '')) = '' THEN RAISE EXCEPTION 'Add a name'; END IF;
  IF v_id IS NULL THEN
    IF btrim(coalesce(p_code, '')) = '' OR p_type NOT IN ('base','stock','purchase') THEN RAISE EXCEPTION 'Add a short code and choose the list'; END IF;
    INSERT INTO public.unit_master (code, label, uom_type, sort_order)
    VALUES (btrim(p_code), btrim(p_label), p_type, coalesce((SELECT max(sort_order) + 1 FROM public.unit_master WHERE uom_type = p_type), 0))
    ON CONFLICT (code, uom_type) DO UPDATE SET label = EXCLUDED.label, is_active = true, updated_at = now()
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.unit_master SET label = btrim(p_label), is_active = coalesce(p_active, is_active), updated_at = now() WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown unit'; END IF;
    UPDATE public.uom_options SET is_active = false, updated_at = now() WHERE master_id = v_id AND NOT coalesce(p_active, true);
  END IF;
  FOR t IN SELECT id FROM public.tenants WHERE coalesce(status, '') <> 'internal' LOOP PERFORM public._sync_tenant_units(t.id); END LOOP;
  RETURN v_id;
END
$function$;
REVOKE ALL ON FUNCTION public.save_master_unit(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_master_unit(uuid, text, text, text, boolean) TO authenticated;
