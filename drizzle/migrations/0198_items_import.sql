-- Items Master upload from the Excel template: one row per item per supplier.
-- import_items checks every row on the server (p_apply = false) and, only when no row has a
-- problem, writes them all in one transaction (p_apply = true). Approvers only (can_edit_item_list).
-- Each applied upload is recorded with the rows as they were before, so it can be undone.

CREATE TABLE IF NOT EXISTS public.item_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL DEFAULT '',
  added_items int NOT NULL DEFAULT 0,
  updated_items int NOT NULL DEFAULT 0,
  supplier_rows int NOT NULL DEFAULT 0,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  undone_at timestamptz,
  undone_by uuid
);
CREATE INDEX IF NOT EXISTS item_import_batches_tenant ON public.item_import_batches (tenant_id, created_at DESC);
ALTER TABLE public.item_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_import_batches_read ON public.item_import_batches;
CREATE POLICY item_import_batches_read ON public.item_import_batches FOR SELECT TO authenticated
  USING (public.can_edit_item_list(tenant_id));
-- No write policies: only the functions below write.

CREATE OR REPLACE FUNCTION public.import_items(p_tenant uuid, p_rows jsonb, p_apply boolean DEFAULT false, p_file_name text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record; x jsonb; probs text[]; v_out jsonb := '[]'::jsonb; any_problem boolean := false;
  v_name text; v_cat text; v_l1 text; v_l2 text; v_l3 text; v_parts text[]; v_l1_id uuid; v_l2_id uuid; v_group text;
  v_stock text; v_supplier text; v_sup_canon text; v_code text; v_sname text; v_pu text; v_per numeric; v_price numeric;
  v_runit text; v_rper numeric; v_stock_yes boolean; v_sku text; v_py numeric; v_cy numeric; v_min numeric; v_reorder numeric;
  v_status text; v_notes text; v_pid uuid; v_cnt int; v_key text; v_kind text; v_entry uuid; v_other text;
  seen jsonb := '{}'::jsonb;      -- item key -> {row, category, stock, stock_yes}
  pairs jsonb := '{}'::jsonb;     -- item key + supplier -> row
  newkeys jsonb := '{}'::jsonb;   -- new item key -> product id (apply)
  v_batch uuid; v_changes jsonb := '[]'::jsonb; n_new int := 0; n_upd int := 0; n_sup int := 0; v_before jsonb;
  v_prefix text; v_next int; v_base numeric; n_rows int;
  num_txt text;
BEGIN
  IF NOT public.can_edit_item_list(p_tenant) THEN RAISE EXCEPTION 'Only an approver can change the Items Master'; END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN RAISE EXCEPTION 'Unknown client'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Nothing to upload'; END IF;
  n_rows := jsonb_array_length(p_rows);
  IF n_rows = 0 THEN RAISE EXCEPTION 'Nothing to upload'; END IF;
  IF n_rows > 5000 THEN RAISE EXCEPTION 'Too many rows: upload at most 5,000 at a time'; END IF;

  -- ---------- Pass 1: check every row ----------
  FOR r IN SELECT e AS j, ord FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(e, ord) LOOP
    x := r.j; probs := '{}';
    v_name := btrim(coalesce(x->>'name', ''));
    v_cat := btrim(coalesce(x->>'category', ''));
    v_stock := btrim(coalesce(x->>'stock_unit', ''));
    v_supplier := btrim(coalesce(x->>'supplier', ''));
    v_code := btrim(coalesce(x->>'supplier_code', ''));
    v_sname := btrim(coalesce(x->>'supplier_item_name', ''));
    v_pu := btrim(coalesce(x->>'purchase_unit', ''));
    v_runit := btrim(coalesce(x->>'recipe_unit', ''));
    v_sku := btrim(coalesce(x->>'sku', ''));
    v_status := initcap(btrim(coalesce(x->>'status', 'Active')));
    v_notes := btrim(coalesce(x->>'notes', ''));
    v_stock_yes := CASE lower(btrim(coalesce(x->>'counts_as_stock', ''))) WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END;

    IF v_name = '' THEN probs := probs || 'No item name'; END IF;
    IF length(v_name) > 200 OR length(v_code) > 100 OR length(v_sname) > 200 OR length(v_notes) > 1000 THEN probs := probs || 'Text too long'; END IF;

    -- numbers: blank stays null, anything else must be a number
    BEGIN v_per := nullif(btrim(coalesce(x->>'per_purchase', '')), '')::numeric; EXCEPTION WHEN others THEN v_per := NULL; probs := probs || 'Stock units per purchase unit is not a number'; END;
    BEGIN v_price := nullif(btrim(coalesce(x->>'price', '')), '')::numeric; EXCEPTION WHEN others THEN v_price := NULL; probs := probs || 'Price is not a number'; END;
    BEGIN v_rper := nullif(btrim(coalesce(x->>'recipe_per_stock', '')), '')::numeric; EXCEPTION WHEN others THEN v_rper := NULL; probs := probs || 'Recipe units is not a number'; END;
    BEGIN v_py := nullif(btrim(coalesce(x->>'purchase_yield', '')), '')::numeric; EXCEPTION WHEN others THEN v_py := NULL; probs := probs || 'Purchase yield is not a number'; END;
    BEGIN v_cy := nullif(btrim(coalesce(x->>'cooking_yield', '')), '')::numeric; EXCEPTION WHEN others THEN v_cy := NULL; probs := probs || 'Cooking yield is not a number'; END;
    BEGIN v_min := nullif(btrim(coalesce(x->>'min_stock', '')), '')::numeric; EXCEPTION WHEN others THEN v_min := NULL; probs := probs || 'Min stock is not a number'; END;
    BEGIN v_reorder := nullif(btrim(coalesce(x->>'reorder', '')), '')::numeric; EXCEPTION WHEN others THEN v_reorder := NULL; probs := probs || 'Reorder qty is not a number'; END;

    -- category must be in this client's list; group comes from the category
    v_l1 := NULL; v_l2 := NULL; v_l3 := NULL; v_group := NULL;
    IF v_cat = '' THEN probs := probs || 'No category';
    ELSE
      v_parts := regexp_split_to_array(v_cat, '\s*>\s*');
      v_l1 := btrim(v_parts[1]); v_l2 := btrim(coalesce(v_parts[2], '')); v_l3 := btrim(coalesce(v_parts[3], ''));
      SELECT id INTO v_l1_id FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id IS NULL AND is_active AND lower(name) = lower(v_l1) LIMIT 1;
      IF v_l1_id IS NULL THEN probs := probs || ('Category ' || v_cat || ' is not in your list');
      ELSE
        SELECT name INTO v_l1 FROM public.product_categories WHERE id = v_l1_id;
        IF v_l2 <> '' THEN
          SELECT id, name INTO v_l2_id, v_l2 FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id = v_l1_id AND is_active AND lower(name) = lower(v_l2) LIMIT 1;
          IF v_l2_id IS NULL THEN probs := probs || ('Category ' || v_cat || ' is not in your list');
          ELSIF v_l3 <> '' THEN
            SELECT name INTO v_other FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id = v_l2_id AND is_active AND lower(name) = lower(v_l3) LIMIT 1;
            IF v_other IS NULL THEN probs := probs || ('Category ' || v_cat || ' is not in your list'); ELSE v_l3 := v_other; END IF;
          END IF;
        END IF;
        SELECT split_part(match_key, '__', 1) INTO v_group FROM public.account_mapping_rules
          WHERE tenant_id = p_tenant AND rule_type = 'procurement_category' AND split_part(match_key, '__', 2) = v_l1 LIMIT 1;
        IF v_group IS NULL THEN
          SELECT cm.default_group INTO v_group FROM public.product_categories pc JOIN public.category_master cm ON cm.id = pc.master_id WHERE pc.id = v_l1_id;
        END IF;
        IF v_group IS NULL THEN
          SELECT financial_treatment INTO v_group FROM public.product_master WHERE tenant_id = p_tenant AND level1_category = v_l1 AND financial_treatment <> ''
            GROUP BY financial_treatment ORDER BY count(*) DESC LIMIT 1;
        END IF;
        IF v_group IS NULL OR v_group NOT IN ('COGS','OpEx','Asset - Supplier Deposit','Asset - Fixed Asset','Asset - Prepayment','Asset - Other') THEN
          probs := probs || ('Category ' || v_l1 || ' has no group: set it in Purchasing setup'); v_group := NULL;
        END IF;
      END IF;
    END IF;

    IF v_stock_yes IS NULL THEN probs := probs || 'Counts as stock must be Yes or No'; END IF;
    IF v_stock = '' THEN probs := probs || 'No stock unit'; END IF;
    IF v_status NOT IN ('Active', 'Inactive') THEN probs := probs || 'Status must be Active or Inactive'; END IF;

    -- supplier must already be in Bani
    v_sup_canon := NULL;
    IF v_supplier = '' THEN probs := probs || 'No supplier';
    ELSE
      SELECT name INTO v_sup_canon FROM public.suppliers WHERE tenant_id = p_tenant AND lower(btrim(name)) = lower(v_supplier) ORDER BY created_at LIMIT 1;
      IF v_sup_canon IS NULL THEN probs := probs || ('Supplier ' || v_supplier || ' is not in Bani'); END IF;
    END IF;
    IF v_code = '' AND v_sname = '' THEN probs := probs || 'No supplier code or supplier''s item name'; END IF;
    IF v_pu = '' THEN probs := probs || 'No purchase unit'; END IF;
    IF v_per IS NULL THEN probs := probs || 'No stock units per purchase unit'; ELSIF v_per <= 0 OR v_per > 100000 THEN probs := probs || 'Stock units per purchase unit must be above 0'; END IF;
    IF v_price IS NULL THEN probs := probs || 'No price'; ELSIF v_price < 0 OR v_price > 10000000 THEN probs := probs || 'Price is out of range'; END IF;
    IF v_rper IS NOT NULL AND (v_rper <= 0 OR v_rper > 1000000) THEN probs := probs || 'Recipe units must be above 0'; END IF;
    IF v_py IS NOT NULL AND (v_py < 1 OR v_py > 100) THEN probs := probs || 'Purchase yield must be 1 to 100'; END IF;
    IF v_cy IS NOT NULL AND (v_cy < 1 OR v_cy > 100) THEN probs := probs || 'Cooking yield must be 1 to 100'; END IF;
    IF (v_min IS NOT NULL AND v_min < 0) OR (v_reorder IS NOT NULL AND v_reorder < 0) THEN probs := probs || 'Stock levels cannot be negative'; END IF;

    -- which item: SKU given = update that item; blank = new item (never a second copy of an existing name)
    v_pid := NULL; v_kind := 'new';
    IF v_sku <> '' THEN
      SELECT count(*), min(id::text)::uuid INTO v_cnt, v_pid FROM public.product_master WHERE tenant_id = p_tenant AND lower(internal_sku) = lower(v_sku);
      IF v_cnt = 0 THEN probs := probs || ('SKU ' || v_sku || ' is not in your items: leave it blank for a new item'); v_pid := NULL;
      ELSIF v_cnt > 1 THEN probs := probs || ('SKU ' || v_sku || ' is used by more than one item'); v_pid := NULL;
      ELSE v_kind := 'update'; END IF;
      v_key := 'sku:' || lower(v_sku);
    ELSE
      SELECT internal_sku INTO v_other FROM public.product_master WHERE tenant_id = p_tenant AND lower(btrim(internal_product_name)) = lower(v_name) LIMIT 1;
      IF v_other IS NOT NULL THEN probs := probs || ('Already in your items as ' || v_other || ': add the SKU to change it'); END IF;
      v_key := 'name:' || lower(v_name);
    END IF;

    -- the same item on several rows must agree on its own details
    IF seen ? v_key THEN
      IF (seen->v_key->>'category') IS DISTINCT FROM v_cat OR (seen->v_key->>'stock') IS DISTINCT FROM lower(v_stock) OR (seen->v_key->>'stock_yes') IS DISTINCT FROM v_stock_yes::text OR (seen->v_key->>'name') IS DISTINCT FROM lower(v_name) THEN
        probs := probs || ('Different item details from row ' || (seen->v_key->>'row'));
      END IF;
    ELSE
      seen := seen || jsonb_build_object(v_key, jsonb_build_object('row', x->>'row', 'category', v_cat, 'stock', lower(v_stock), 'stock_yes', v_stock_yes::text, 'name', lower(v_name)));
    END IF;
    IF v_sup_canon IS NOT NULL THEN
      IF pairs ? (v_key || '|' || lower(v_sup_canon)) THEN probs := probs || ('Same item and supplier as row ' || (pairs->>(v_key || '|' || lower(v_sup_canon))));
      ELSE pairs := pairs || jsonb_build_object(v_key || '|' || lower(v_sup_canon), x->>'row'); END IF;
      -- a supplier code belongs to one item per supplier
      IF v_code <> '' THEN
        SELECT pm.internal_sku INTO v_other FROM public.product_suppliers ps JOIN public.product_master pm ON pm.id = ps.product_master_id
          WHERE ps.tenant_id = p_tenant AND lower(btrim(ps.supplier)) = lower(v_sup_canon) AND lower(btrim(ps.external_sku)) = lower(v_code)
            AND (v_pid IS NULL OR ps.product_master_id <> v_pid) LIMIT 1;
        IF v_other IS NOT NULL THEN probs := probs || ('Supplier code ' || v_code || ' is already used for ' || v_other); END IF;
        IF pairs ? ('code|' || lower(v_sup_canon) || '|' || lower(v_code)) AND (pairs->>('code|' || lower(v_sup_canon) || '|' || lower(v_code))) <> v_key THEN
          probs := probs || ('Supplier code ' || v_code || ' is on another item in this file');
        ELSE pairs := pairs || jsonb_build_object('code|' || lower(v_sup_canon) || '|' || lower(v_code), v_key); END IF;
      END IF;
    END IF;

    IF array_length(probs, 1) > 0 THEN any_problem := true; END IF;
    v_out := v_out || jsonb_build_object('row', x->'row', 'result', CASE WHEN array_length(probs, 1) > 0 THEN 'problem' ELSE v_kind END,
      'name', v_name, 'supplier', coalesce(v_sup_canon, v_supplier), 'problems', to_jsonb(probs));
  END LOOP;

  IF NOT p_apply OR any_problem THEN
    RETURN jsonb_build_object('applied', false, 'rows', v_out,
      'new', (SELECT count(DISTINCT e->>'name') FROM jsonb_array_elements(v_out) e WHERE e->>'result' = 'new'),
      'update', (SELECT count(*) FROM jsonb_array_elements(v_out) e WHERE e->>'result' = 'update'),
      'problem', (SELECT count(*) FROM jsonb_array_elements(v_out) e WHERE e->>'result' = 'problem'));
  END IF;

  -- ---------- Pass 2: write everything (all rows passed) ----------
  INSERT INTO public.item_import_batches (tenant_id, user_id, file_name) VALUES (p_tenant, auth.uid(), left(coalesce(p_file_name, ''), 200)) RETURNING id INTO v_batch;
  FOR r IN SELECT e AS j FROM jsonb_array_elements(p_rows) e LOOP
    x := r.j;
    v_name := btrim(x->>'name'); v_cat := btrim(x->>'category'); v_stock := btrim(x->>'stock_unit');
    v_code := btrim(coalesce(x->>'supplier_code', '')); v_sname := btrim(coalesce(x->>'supplier_item_name', ''));
    v_pu := btrim(x->>'purchase_unit'); v_runit := btrim(coalesce(x->>'recipe_unit', '')); v_sku := btrim(coalesce(x->>'sku', ''));
    v_status := initcap(btrim(coalesce(x->>'status', 'Active'))); v_notes := btrim(coalesce(x->>'notes', ''));
    v_stock_yes := lower(btrim(x->>'counts_as_stock')) = 'yes';
    v_per := (x->>'per_purchase')::numeric; v_price := (x->>'price')::numeric;
    v_rper := nullif(btrim(coalesce(x->>'recipe_per_stock', '')), '')::numeric;
    v_py := coalesce(nullif(btrim(coalesce(x->>'purchase_yield', '')), '')::numeric, 100);
    v_cy := coalesce(nullif(btrim(coalesce(x->>'cooking_yield', '')), '')::numeric, 100);
    v_min := nullif(btrim(coalesce(x->>'min_stock', '')), '')::numeric; v_reorder := nullif(btrim(coalesce(x->>'reorder', '')), '')::numeric;
    v_parts := regexp_split_to_array(v_cat, '\s*>\s*');
    SELECT id, name INTO v_l1_id, v_l1 FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id IS NULL AND is_active AND lower(name) = lower(btrim(v_parts[1])) LIMIT 1;
    v_l2 := ''; v_l3 := '';
    IF btrim(coalesce(v_parts[2], '')) <> '' THEN
      SELECT id, name INTO v_l2_id, v_l2 FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id = v_l1_id AND is_active AND lower(name) = lower(btrim(v_parts[2])) LIMIT 1;
      IF btrim(coalesce(v_parts[3], '')) <> '' THEN
        SELECT name INTO v_l3 FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id = v_l2_id AND is_active AND lower(name) = lower(btrim(v_parts[3])) LIMIT 1;
      END IF;
    END IF;
    v_group := NULL;
    SELECT split_part(match_key, '__', 1) INTO v_group FROM public.account_mapping_rules WHERE tenant_id = p_tenant AND rule_type = 'procurement_category' AND split_part(match_key, '__', 2) = v_l1 LIMIT 1;
    IF v_group IS NULL THEN SELECT cm.default_group INTO v_group FROM public.product_categories pc JOIN public.category_master cm ON cm.id = pc.master_id WHERE pc.id = v_l1_id; END IF;
    IF v_group IS NULL THEN SELECT financial_treatment INTO v_group FROM public.product_master WHERE tenant_id = p_tenant AND level1_category = v_l1 AND financial_treatment <> '' GROUP BY financial_treatment ORDER BY count(*) DESC LIMIT 1; END IF;
    SELECT name INTO v_sup_canon FROM public.suppliers WHERE tenant_id = p_tenant AND lower(btrim(name)) = lower(btrim(x->>'supplier')) ORDER BY created_at LIMIT 1;
    v_base := v_per * coalesce(v_rper, 1);

    IF v_sku <> '' THEN
      SELECT id INTO v_pid FROM public.product_master WHERE tenant_id = p_tenant AND lower(internal_sku) = lower(v_sku);
      v_key := 'sku:' || lower(v_sku);
      IF NOT (newkeys ? v_key) THEN
        SELECT to_jsonb(pm) INTO v_before FROM public.product_master pm WHERE id = v_pid;
        v_changes := v_changes || jsonb_build_object('t', 'product_master', 'id', v_pid, 'before', v_before);
        UPDATE public.product_master SET internal_product_name = v_name, level1_category = v_l1, level2_category = v_l2, level3_category = v_l3,
          financial_treatment = v_group, stock_uom = v_stock, unit = v_stock, creates_stock_movement = v_stock_yes,
          base_unit_type = CASE WHEN v_runit <> '' THEN v_runit ELSE base_unit_type END,
          purchase_yield = v_py, cooking_yield = v_cy, min_stock_qty = v_min, reorder_qty = v_reorder, status = v_status, notes = v_notes
          WHERE id = v_pid AND tenant_id = p_tenant;
        newkeys := newkeys || jsonb_build_object(v_key, v_pid);
        n_upd := n_upd + 1;
      END IF;
    ELSE
      v_key := 'name:' || lower(v_name);
      IF newkeys ? v_key THEN v_pid := (newkeys->>v_key)::uuid;
      ELSE
        -- SKU like the client's own: the prefix most used in this category, else its first three letters
        SELECT upper(split_part(internal_sku, '-', 1)) INTO v_prefix FROM public.product_master
          WHERE tenant_id = p_tenant AND level1_category = v_l1 AND level2_category = v_l2 AND internal_sku ~ '^[A-Za-z]{2,6}-[0-9]+$'
          GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
        IF v_prefix IS NULL THEN v_prefix := upper(left(regexp_replace(coalesce(nullif(v_l2, ''), v_l1), '[^A-Za-z]', '', 'g'), 3)); END IF;
        IF v_prefix = '' THEN v_prefix := 'ITM'; END IF;
        SELECT coalesce(max(substring(internal_sku FROM '-([0-9]+)$')::int), 0) + 1 INTO v_next FROM public.product_master
          WHERE tenant_id = p_tenant AND upper(internal_sku) ~ ('^' || v_prefix || '-[0-9]+$');
        INSERT INTO public.product_master (tenant_id, internal_sku, internal_product_name, level1_category, level2_category, level3_category,
            financial_treatment, unit, stock_uom, stock_qty, purchase_unit, purchase_unit_cost, unit_cost, cost_per_stock_unit,
            base_unit_type, base_unit_qty, cost_per_base_unit, creates_stock_movement, purchase_yield, cooking_yield,
            min_stock_qty, reorder_qty, status, notes, supplier, external_sku, supplier_product_name)
          VALUES (p_tenant, v_prefix || '-' || lpad(v_next::text, 4, '0'), v_name, v_l1, v_l2, v_l3,
            v_group, v_stock, v_stock, v_per, v_pu, v_price, v_price / v_per, v_price / v_per,
            CASE WHEN v_runit <> '' THEN v_runit ELSE 'g' END, v_base, v_price / v_base, v_stock_yes, v_py, v_cy,
            v_min, v_reorder, v_status, v_notes, v_sup_canon, v_code, v_sname)
          RETURNING id INTO v_pid;
        v_changes := v_changes || jsonb_build_object('t', 'product_master', 'id', v_pid, 'before', null);
        newkeys := newkeys || jsonb_build_object(v_key, v_pid);
        n_new := n_new + 1;
      END IF;
    END IF;

    -- this supplier's entry for the item
    SELECT id, to_jsonb(ps) INTO v_entry, v_before FROM public.product_suppliers ps
      WHERE tenant_id = p_tenant AND product_master_id = v_pid AND lower(btrim(supplier)) = lower(v_sup_canon) ORDER BY created_at LIMIT 1;
    IF v_entry IS NULL THEN
      INSERT INTO public.product_suppliers (tenant_id, product_master_id, supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost,
          stock_uom, stock_qty, base_unit_type, base_unit_qty, status)
        VALUES (p_tenant, v_pid, v_sup_canon, v_code, v_sname, v_pu, v_price, v_stock, v_per, CASE WHEN v_runit <> '' THEN v_runit ELSE 'g' END, v_base, v_status)
        RETURNING id INTO v_entry;
      v_changes := v_changes || jsonb_build_object('t', 'product_suppliers', 'id', v_entry, 'before', null);
    ELSE
      v_changes := v_changes || jsonb_build_object('t', 'product_suppliers', 'id', v_entry, 'before', v_before);
      UPDATE public.product_suppliers SET external_sku = v_code, supplier_product_name = CASE WHEN v_sname <> '' THEN v_sname ELSE supplier_product_name END,
          purchase_unit = v_pu, purchase_unit_cost = v_price, stock_uom = v_stock, stock_qty = v_per,
          base_unit_type = CASE WHEN v_runit <> '' THEN v_runit ELSE base_unit_type END, base_unit_qty = CASE WHEN v_rper IS NOT NULL THEN v_base ELSE base_unit_qty END, status = v_status
        WHERE id = v_entry AND tenant_id = p_tenant;
    END IF;
    n_sup := n_sup + 1;
    -- the item's own price follows its latest supplier price (same as Scan Invoice)
    UPDATE public.product_master SET purchase_unit = v_pu, purchase_unit_cost = v_price, unit_cost = v_price / v_per, cost_per_stock_unit = v_price / v_per,
        stock_qty = v_per, cost_per_base_unit = v_price / v_base, base_unit_qty = v_base
      WHERE id = v_pid AND tenant_id = p_tenant;
  END LOOP;

  UPDATE public.item_import_batches SET changes = v_changes, added_items = n_new, updated_items = n_upd, supplier_rows = n_sup WHERE id = v_batch;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
    VALUES (p_tenant, auth.uid(), 'items_imported', 'item_import_batches', v_batch::text,
      jsonb_build_object('title', 'Items uploaded', 'added', n_new, 'updated', n_upd, 'supplier_rows', n_sup, 'file', left(coalesce(p_file_name, ''), 200)));
  RETURN jsonb_build_object('applied', true, 'batch', v_batch, 'new', n_new, 'update', n_upd, 'supplier_rows', n_sup, 'rows', v_out);
END $function$;

-- Undo an upload: only the latest one not yet undone, and only while nothing has used the new items.
CREATE OR REPLACE FUNCTION public.undo_item_import(p_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b public.item_import_batches; c jsonb; v_id uuid;
BEGIN
  SELECT * INTO b FROM public.item_import_batches WHERE id = p_batch FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Upload not found'; END IF;
  IF NOT public.can_edit_item_list(b.tenant_id) THEN RAISE EXCEPTION 'Only an approver can change the Items Master'; END IF;
  IF b.undone_at IS NOT NULL THEN RAISE EXCEPTION 'This upload was already undone'; END IF;
  IF EXISTS (SELECT 1 FROM public.item_import_batches WHERE tenant_id = b.tenant_id AND created_at > b.created_at AND undone_at IS NULL) THEN
    RAISE EXCEPTION 'Undo the newer upload first'; END IF;
  -- items this upload added must not be on any invoice yet
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(b.changes) e JOIN public.invoice_line_items li ON li.product_master_id = (e->>'id')::uuid AND li.tenant_id = b.tenant_id
             WHERE e->>'t' = 'product_master' AND e->'before' = 'null'::jsonb) THEN
    RAISE EXCEPTION 'An item from this upload is already on an invoice, so it cannot be undone'; END IF;
  -- newest change first
  FOR c IN SELECT e FROM jsonb_array_elements(b.changes) WITH ORDINALITY t(e, o) ORDER BY o DESC LOOP
    v_id := (c->>'id')::uuid;
    IF c->>'t' = 'product_suppliers' THEN
      IF c->'before' = 'null'::jsonb THEN DELETE FROM public.product_suppliers WHERE id = v_id AND tenant_id = b.tenant_id;
      ELSE
        UPDATE public.product_suppliers s SET external_sku = o.external_sku, supplier_product_name = o.supplier_product_name, purchase_unit = o.purchase_unit,
            purchase_unit_cost = o.purchase_unit_cost, stock_uom = o.stock_uom, stock_qty = o.stock_qty, base_unit_type = o.base_unit_type,
            base_unit_qty = o.base_unit_qty, status = o.status
          FROM jsonb_populate_record(NULL::public.product_suppliers, c->'before') o WHERE s.id = v_id AND s.tenant_id = b.tenant_id;
      END IF;
    ELSE
      IF c->'before' = 'null'::jsonb THEN DELETE FROM public.product_master WHERE id = v_id AND tenant_id = b.tenant_id;
      ELSE
        UPDATE public.product_master p SET internal_product_name = o.internal_product_name, level1_category = o.level1_category, level2_category = o.level2_category,
            level3_category = o.level3_category, financial_treatment = o.financial_treatment, unit = o.unit, stock_uom = o.stock_uom, stock_qty = o.stock_qty,
            purchase_unit = o.purchase_unit, purchase_unit_cost = o.purchase_unit_cost, unit_cost = o.unit_cost, cost_per_stock_unit = o.cost_per_stock_unit,
            base_unit_type = o.base_unit_type, base_unit_qty = o.base_unit_qty, cost_per_base_unit = o.cost_per_base_unit,
            creates_stock_movement = o.creates_stock_movement, purchase_yield = o.purchase_yield, cooking_yield = o.cooking_yield,
            min_stock_qty = o.min_stock_qty, reorder_qty = o.reorder_qty, status = o.status, notes = o.notes
          FROM jsonb_populate_record(NULL::public.product_master, c->'before') o WHERE p.id = v_id AND p.tenant_id = b.tenant_id;
      END IF;
    END IF;
  END LOOP;
  UPDATE public.item_import_batches SET undone_at = now(), undone_by = auth.uid() WHERE id = p_batch;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
    VALUES (b.tenant_id, auth.uid(), 'items_import_undone', 'item_import_batches', p_batch::text, jsonb_build_object('title', 'Items upload undone'));
  RETURN jsonb_build_object('undone', true);
END $function$;

REVOKE ALL ON FUNCTION public.import_items(uuid, jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_item_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_items(uuid, jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_item_import(uuid) TO authenticated;