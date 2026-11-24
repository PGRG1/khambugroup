-- One master category list (Level 1 → 2 → 3) kept by Bani and shared by every client. Each client's
-- product_categories holds the master rows (master_id set) plus its own additions (master_id null). Products keep
-- choosing from their client's list. Nothing about existing products changes here; tidying is a separate, audited action.

-- 1. A client's top-level names were unique across all clients by mistake; make them unique per client.
DROP INDEX IF EXISTS public.product_categories_unique_root;
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_unique_root ON public.product_categories (tenant_id, lower(name)) WHERE parent_id IS NULL;

-- 2. The master list.
CREATE TABLE IF NOT EXISTS public.category_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 3),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  parent_id uuid REFERENCES public.category_master(id) ON DELETE CASCADE,
  default_group text CHECK (default_group IS NULL OR default_group IN ('COGS','OpEx','Asset - Supplier Deposit','Asset - Fixed Asset','Asset - Prepayment','Asset - Other')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((level = 1) = (parent_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS category_master_unique ON public.category_master (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
ALTER TABLE public.category_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "category master readable" ON public.category_master;
CREATE POLICY "category master readable" ON public.category_master FOR SELECT TO authenticated USING (true);

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS master_id uuid REFERENCES public.category_master(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS product_categories_master ON public.product_categories (tenant_id, master_id);

-- 3. First master list: KHAMBU's list, tidied (Adjustements → Adjustments; Cigar → Cigars; Herbs & Spices → Herbs;
--    the stray top-level Repair & Maintenance sits under Operating Services), plus Supplier Refunds.
DO $seed$
DECLARE k uuid := '00000000-0000-0000-0000-00000000beef'; r record; m1 uuid; m2 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.category_master) THEN RETURN; END IF;
  INSERT INTO public.category_master (level, name, default_group, sort_order) VALUES
    (1, 'Food', 'COGS', 1), (1, 'Beverages', 'COGS', 2), (1, 'Tobacco', 'COGS', 3), (1, 'Supplies', 'OpEx', 4),
    (1, 'Operating Services', 'OpEx', 5), (1, 'Deposits', 'Asset - Supplier Deposit', 6), (1, 'Supplier Refunds', 'COGS', 7), (1, 'Adjustments', 'COGS', 8);
  FOR r IN
    SELECT p2.id, p2.name, p1.name AS l1 FROM public.product_categories p2 JOIN public.product_categories p1 ON p1.id = p2.parent_id
     WHERE p2.tenant_id = k AND p2.level = 2 AND p2.is_active AND p2.name NOT IN ('Cigar', 'Herbs & Spices')
     ORDER BY p2.sort_order, p2.name
  LOOP
    SELECT id INTO m1 FROM public.category_master WHERE level = 1 AND lower(name) = lower(r.l1);
    CONTINUE WHEN m1 IS NULL;
    INSERT INTO public.category_master (level, name, parent_id) VALUES (2, r.name, m1) ON CONFLICT DO NOTHING;
  END LOOP;
  FOR r IN
    SELECT p3.name, CASE p2.name WHEN 'Cigar' THEN 'Cigars' WHEN 'Herbs & Spices' THEN 'Herbs' ELSE p2.name END AS l2, p1.name AS l1
      FROM public.product_categories p3 JOIN public.product_categories p2 ON p2.id = p3.parent_id JOIN public.product_categories p1 ON p1.id = p2.parent_id
     WHERE p3.tenant_id = k AND p3.level = 3 AND p3.is_active
     ORDER BY p3.sort_order, p3.name
  LOOP
    SELECT c2.id INTO m2 FROM public.category_master c2 JOIN public.category_master c1 ON c1.id = c2.parent_id
     WHERE c2.level = 2 AND lower(c2.name) = lower(r.l2) AND lower(c1.name) = lower(r.l1);
    CONTINUE WHEN m2 IS NULL;
    INSERT INTO public.category_master (level, name, parent_id) VALUES (3, r.name, m2) ON CONFLICT DO NOTHING;
  END LOOP;
  -- Repair and maintenance work belongs under Operating Services.
  SELECT id INTO m1 FROM public.category_master WHERE level = 1 AND name = 'Operating Services';
  INSERT INTO public.category_master (level, name, parent_id) VALUES (2, 'Repair and Maintenance', m1) ON CONFLICT DO NOTHING;
END
$seed$;

-- 4. Give a client every master category it does not have yet, linking rows it already has by name.
CREATE OR REPLACE FUNCTION public._sync_tenant_categories(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE m record; v_parent uuid; v_id uuid;
BEGIN
  FOR m IN SELECT * FROM public.category_master WHERE is_active ORDER BY level, sort_order, name LOOP
    IF EXISTS (SELECT 1 FROM public.product_categories WHERE tenant_id = p_tenant AND master_id = m.id) THEN
      UPDATE public.product_categories SET name = m.name, updated_at = now()
       WHERE tenant_id = p_tenant AND master_id = m.id AND name <> m.name
         AND NOT EXISTS (SELECT 1 FROM public.product_categories o WHERE o.tenant_id = p_tenant AND o.master_id IS DISTINCT FROM m.id
                          AND o.parent_id IS NOT DISTINCT FROM product_categories.parent_id AND lower(o.name) = lower(m.name));
      CONTINUE;
    END IF;
    v_parent := NULL;
    IF m.parent_id IS NOT NULL THEN
      SELECT id INTO v_parent FROM public.product_categories WHERE tenant_id = p_tenant AND master_id = m.parent_id LIMIT 1;
      CONTINUE WHEN v_parent IS NULL;
    END IF;
    SELECT id INTO v_id FROM public.product_categories
     WHERE tenant_id = p_tenant AND level = m.level AND parent_id IS NOT DISTINCT FROM v_parent AND lower(name) = lower(m.name) AND master_id IS NULL LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.product_categories SET master_id = m.id, is_active = true, updated_at = now() WHERE id = v_id;
    ELSE
      INSERT INTO public.product_categories (tenant_id, name, level, parent_id, sort_order, is_active, master_id)
      VALUES (p_tenant, m.name, m.level, v_parent, m.sort_order, true, m.id);
    END IF;
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public._sync_tenant_categories(uuid) FROM PUBLIC, anon, authenticated;

DO $sync$
DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE coalesce(status, '') <> 'internal' LOOP
    PERFORM public._sync_tenant_categories(t.id);
  END LOOP;
END
$sync$;

-- New clients get the master list too.
CREATE OR REPLACE FUNCTION public._tenant_categories_on_create() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN IF coalesce(NEW.status, '') <> 'internal' THEN PERFORM public._sync_tenant_categories(NEW.id); END IF; RETURN NEW; END $function$;
DROP TRIGGER IF EXISTS tenants_master_categories ON public.tenants;
CREATE TRIGGER tenants_master_categories AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public._tenant_categories_on_create();

-- 5. Bani changes the master list; every client follows.
CREATE OR REPLACE FUNCTION public.save_master_category(p_id uuid, p_name text, p_parent uuid DEFAULT NULL, p_group text DEFAULT NULL, p_active boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid := p_id; v_level smallint; t record;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Only Bani can change the master categories'; END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'Add a name'; END IF;
  IF v_id IS NULL THEN
    v_level := CASE WHEN p_parent IS NULL THEN 1 ELSE (SELECT level + 1 FROM public.category_master WHERE id = p_parent) END;
    IF v_level IS NULL OR v_level > 3 THEN RAISE EXCEPTION 'Choose where it goes'; END IF;
    IF v_level = 1 AND p_group IS NULL THEN RAISE EXCEPTION 'A Level 1 needs a group'; END IF;
    INSERT INTO public.category_master (level, name, parent_id, default_group, sort_order)
    VALUES (v_level, btrim(p_name), p_parent, CASE WHEN v_level = 1 THEN p_group END, coalesce((SELECT max(sort_order) + 1 FROM public.category_master WHERE parent_id IS NOT DISTINCT FROM p_parent), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.category_master SET name = btrim(p_name), default_group = CASE WHEN level = 1 THEN coalesce(p_group, default_group) END,
           is_active = coalesce(p_active, is_active), updated_at = now() WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown category'; END IF;
  END IF;
  FOR t IN SELECT id FROM public.tenants WHERE coalesce(status, '') <> 'internal' LOOP PERFORM public._sync_tenant_categories(t.id); END LOOP;
  RETURN v_id;
END
$function$;
REVOKE ALL ON FUNCTION public.save_master_category(uuid, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_master_category(uuid, text, uuid, text, boolean) TO authenticated;

-- A client's own category joins the master list (its parent must already be a master category).
CREATE OR REPLACE FUNCTION public.promote_client_category(p_category uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE c public.product_categories%ROWTYPE; v_parent uuid; v_group text; v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Only Bani can change the master categories'; END IF;
  SELECT * INTO c FROM public.product_categories WHERE id = p_category;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown category'; END IF;
  IF c.master_id IS NOT NULL THEN RETURN c.master_id; END IF;
  IF c.parent_id IS NOT NULL THEN
    SELECT master_id INTO v_parent FROM public.product_categories WHERE id = c.parent_id;
    IF v_parent IS NULL THEN RAISE EXCEPTION 'Add its parent to the master list first'; END IF;
  ELSE
    SELECT pm.financial_treatment INTO v_group FROM public.product_master pm WHERE pm.tenant_id = c.tenant_id AND pm.level1_category = c.name AND coalesce(pm.financial_treatment, '') <> '' LIMIT 1;
    v_group := coalesce(v_group, 'COGS');
  END IF;
  v_id := public.save_master_category(NULL, c.name, v_parent, v_group, true);
  UPDATE public.product_categories SET master_id = v_id WHERE id = c.id;
  RETURN v_id;
END
$function$;
REVOKE ALL ON FUNCTION public.promote_client_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_client_category(uuid) TO authenticated;

-- 6. A client's own Level 1: needs a group, and the account it posts to (Approve on Finance).
CREATE OR REPLACE FUNCTION public.add_client_level1(p_tenant uuid, p_name text, p_group text, p_account uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.is_platform_admin() OR public.access_level(p_tenant, 'finance') >= 3) THEN RAISE EXCEPTION 'Only Approve on Finance can add a Level 1'; END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'Add a name'; END IF;
  IF p_group NOT IN ('COGS','OpEx','Asset - Supplier Deposit','Asset - Fixed Asset','Asset - Prepayment','Asset - Other') THEN RAISE EXCEPTION 'Choose a group'; END IF;
  IF p_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = p_account AND tenant_id = p_tenant) THEN RAISE EXCEPTION 'Unknown account'; END IF;
  INSERT INTO public.product_categories (tenant_id, name, level, parent_id, sort_order, is_active)
  VALUES (p_tenant, btrim(p_name), 1, NULL, coalesce((SELECT max(sort_order) + 1 FROM public.product_categories WHERE tenant_id = p_tenant AND level = 1), 1), true)
  RETURNING id INTO v_id;
  IF p_account IS NOT NULL THEN
    INSERT INTO public.account_mapping_rules (tenant_id, rule_type, match_key, account_id) VALUES (p_tenant, 'procurement_category', p_group || '__' || btrim(p_name), p_account)
    ON CONFLICT (tenant_id, rule_type, match_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();
  END IF;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_tenant, auth.uid(), 'category_added', 'product_categories', v_id::text, jsonb_build_object('title', 'Category ' || btrim(p_name) || ' added', 'group', p_group));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION '% already exists', btrim(p_name);
END
$function$;
REVOKE ALL ON FUNCTION public.add_client_level1(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_client_level1(uuid, text, text, uuid) TO authenticated;

-- 7. Tidy: merge one category into another at the same level. Products and sub-categories move across; audited.
CREATE OR REPLACE FUNCTION public.merge_product_category(p_tenant uuid, p_from uuid, p_into uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE f public.product_categories%ROWTYPE; i public.product_categories%ROWTYPE; f1 text; f2 text; i1 text; i2 text; n int := 0; ch record; dup uuid;
BEGIN
  IF NOT (public.is_platform_admin() OR public.access_level(p_tenant, 'purchasing') >= 3 OR public.access_level(p_tenant, 'finance') >= 3) THEN
    RAISE EXCEPTION 'You do not have permission to tidy categories'; END IF;
  SELECT * INTO f FROM public.product_categories WHERE id = p_from AND tenant_id = p_tenant;
  SELECT * INTO i FROM public.product_categories WHERE id = p_into AND tenant_id = p_tenant;
  IF f.id IS NULL OR i.id IS NULL OR f.id = i.id THEN RAISE EXCEPTION 'Choose two different categories'; END IF;
  IF f.level <> i.level THEN RAISE EXCEPTION 'Both must be at the same level'; END IF;
  -- Names of each one's parents, as products store them.
  IF f.level >= 2 THEN SELECT name INTO f1 FROM public.product_categories WHERE id = CASE WHEN f.level = 2 THEN f.parent_id ELSE (SELECT parent_id FROM public.product_categories WHERE id = f.parent_id) END; END IF;
  IF i.level >= 2 THEN SELECT name INTO i1 FROM public.product_categories WHERE id = CASE WHEN i.level = 2 THEN i.parent_id ELSE (SELECT parent_id FROM public.product_categories WHERE id = i.parent_id) END; END IF;
  IF f.level = 3 THEN SELECT name INTO f2 FROM public.product_categories WHERE id = f.parent_id; SELECT name INTO i2 FROM public.product_categories WHERE id = i.parent_id; END IF;
  IF f.level = 1 THEN
    UPDATE public.product_master SET level1_category = i.name, updated_at = now() WHERE tenant_id = p_tenant AND level1_category = f.name;
  ELSIF f.level = 2 THEN
    UPDATE public.product_master SET level1_category = i1, level2_category = i.name, updated_at = now() WHERE tenant_id = p_tenant AND level1_category = f1 AND level2_category = f.name;
  ELSE
    UPDATE public.product_master SET level1_category = i1, level2_category = i2, level3_category = i.name, updated_at = now() WHERE tenant_id = p_tenant AND level1_category = f1 AND level2_category = f2 AND level3_category = f.name;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Sub-categories move under the one kept; a same-named one is folded in.
  FOR ch IN SELECT * FROM public.product_categories WHERE parent_id = f.id LOOP
    SELECT id INTO dup FROM public.product_categories WHERE parent_id = i.id AND lower(name) = lower(ch.name);
    IF dup IS NULL THEN UPDATE public.product_categories SET parent_id = i.id, updated_at = now() WHERE id = ch.id;
    ELSE
      UPDATE public.product_categories SET parent_id = dup WHERE parent_id = ch.id AND NOT EXISTS (SELECT 1 FROM public.product_categories x WHERE x.parent_id = dup AND lower(x.name) = lower(product_categories.name));
      DELETE FROM public.product_categories WHERE id = ch.id;
    END IF;
  END LOOP;
  DELETE FROM public.product_categories WHERE id = f.id;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_tenant, auth.uid(), 'category_merged', 'product_categories', i.id::text,
          jsonb_build_object('title', f.name || ' merged into ' || i.name, 'from', f.name, 'into', i.name, 'level', f.level, 'products', n));
  RETURN n;
END
$function$;
REVOKE ALL ON FUNCTION public.merge_product_category(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_product_category(uuid, uuid, uuid) TO authenticated;
