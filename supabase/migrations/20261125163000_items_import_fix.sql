-- Fix: problem messages are added with array_append (text || text[] was read as an array literal).
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

    IF v_name = '' THEN probs := array_append(probs, ('No item name')::text); END IF;
    IF length(v_name) > 200 OR length(v_code) > 100 OR length(v_sname) > 200 OR length(v_notes) > 1000 THEN probs := array_append(probs, ('Text too long')::text); END IF;

    -- numbers: blank stays null, anything else must be a number
    BEGIN v_per := nullif(btrim(coalesce(x->>'per_purchase', '')), '')::numeric; EXCEPTION WHEN others THEN v_per := NULL; probs := array_append(probs, ('Stock units per purchase unit is not a number')::text); END;
    BEGIN v_price := nullif(btrim(coalesce(x->>'price', '')), '')::numeric; EXCEPTION WHEN others THEN v_price := NULL; probs := array_append(probs, ('Price is not a number')::text); END;
    BEGIN v_rper := nullif(btrim(coalesce(x->>'recipe_per_stock', '')), '')::numeric; EXCEPTION WHEN others THEN v_rper := NULL; probs := array_append(probs, ('Recipe units is not a number')::text); END;
    BEGIN v_py := nullif(btrim(coalesce(x->>'purchase_yield', '')), '')::numeric; EXCEPTION WHEN others THEN v_py := NULL; probs := array_append(probs, ('Purchase yield is not a number')::text); END;
    BEGIN v_cy := nullif(btrim(coalesce(x->>'cooking_yield', '')), '')::numeric; EXCEPTION WHEN others THEN v_cy := NULL; probs := array_append(probs, ('Cooking yield is not a number')::text); END;
    BEGIN v_min := nullif(btrim(coalesce(x->>'min_stock', '')), '')::numeric; EXCEPTION WHEN others THEN v_min := NULL; probs := array_append(probs, ('Min stock is not a number')::text); END;
    BEGIN v_reorder := nullif(btrim(coalesce(x->>'reorder', '')), '')::numeric; EXCEPTION WHEN others THEN v_reorder := NULL; probs := array_append(probs, ('Reorder qty is not a number')::text); END;

    -- category must be in this client's list; group comes from the category
    v_l1 := NULL; v_l2 := NULL; v_l3 := NULL; v_group := NULL;
    IF v_cat = '' THEN probs := array_append(probs, ('No category')::text);
    ELSE
      v_parts := regexp_split_to_array(v_cat, '\s*>\s*');
      v_l1 := btrim(v_parts[1]); v_l2 := btrim(coalesce(v_parts[2], '')); v_l3 := btrim(coalesce(v_parts[3], ''));
      SELECT id INTO v_l1_id FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id IS NULL AND is_active AND lower(name) = lower(v_l1) LIMIT 1;
      IF v_l1_id IS NULL THEN probs := array_append(probs, (('Category ' || v_cat || ' is not in your list'))::text);
      ELSE
        SELECT name INTO v_l1 FROM public.product_categories WHERE id = v_l1_id;
        IF v_l2 <> '' THEN
          SELECT id, name INTO v_l2_id, v_l2 FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id = v_l1_id AND is_active AND lower(name) = lower(v_l2) LIMIT 1;
          IF v_l2_id IS NULL THEN probs := array_append(probs, (('Category ' || v_cat || ' is not in your list'))::text);
          ELSIF v_l3 <> '' THEN
            SELECT name INTO v_other FROM public.product_categories WHERE tenant_id = p_tenant AND parent_id = v_l2_id AND is_active AND lower(name) = lower(v_l3) LIMIT 1;
            IF v_other IS NULL THEN probs := array_append(probs, (('Category ' || v_cat || ' is not in your list'))::text); ELSE v_l3 := v_other; END IF;
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
          probs := array_append(probs, ('Category ' || v_l1 || ' has no group: set it in Purchasing setup')::text); v_group := NULL;
        END IF;
      END IF;
    END IF;

    IF v_stock_yes IS NULL THEN probs := array_append(probs, ('Counts as stock must be Yes or No')::text); END IF;
    IF v_stock = '' THEN probs := array_append(probs, ('No stock unit')::text); END IF;
    IF v_status NOT IN ('Active', 'Inactive') THEN probs := array_append(probs, ('Status must be Active or Inactive')::text); END IF;

    -- supplier must already be in Bani
    v_sup_canon := NULL;
    IF v_supplier = '' THEN probs := array_append(probs, ('No supplier')::text);
    ELSE
      SELECT name INTO v_sup_canon FROM public.suppliers WHERE tenant_id = p_tenant AND lower(btrim(name)) = lower(v_supplier) ORDER BY created_at LIMIT 1;
      IF v_sup_canon IS NULL THEN probs := array_append(probs, (('Supplier ' || v_supplier || ' is not in Bani'))::text); END IF;
    END IF;
    IF v_code = '' AND v_sname = '' THEN probs := array_append(probs, ('No supplier code or supplier''s item name')::text); END IF;
    IF v_pu = '' THEN probs := array_append(probs, ('No purchase unit')::text); END IF;
    IF v_per IS NULL THEN probs := array_append(probs, ('No stock units per purchase unit')::text); ELSIF v_per <= 0 OR v_per > 100000 THEN probs := array_append(probs, ('Stock units per purchase unit must be above 0')::text); END IF;
    IF v_price IS NULL THEN probs := array_append(probs, ('No price')::text); ELSIF v_price < 0 OR v_price > 10000000 THEN probs := array_append(probs, ('Price is out of range')::text); END IF;
    IF v_rper IS NOT NULL AND (v_rper <= 0 OR v_rper > 1000000) THEN probs := array_append(probs, ('Recipe units must be above 0')::text); END IF;
    IF v_py IS NOT NULL AND (v_py < 1 OR v_py > 100) THEN probs := array_append(probs, ('Purchase yield must be 1 to 100')::text); END IF;
    IF v_cy IS NOT NULL AND (v_cy < 1 OR v_cy > 100) THEN probs := array_append(probs, ('Cooking yield must be 1 to 100')::text); END IF;
    IF (v_min IS NOT NULL AND v_min < 0) OR (v_reorder IS NOT NULL AND v_reorder < 0) THEN probs := array_append(probs, ('Stock levels cannot be negative')::text); END IF;

    -- which item: SKU given = update that item; blank = new item (never a second copy of an existing name)
    v_pid := NULL; v_kind := 'new';
    IF v_sku <> '' THEN
      SELECT count(*), min(id::text)::uuid INTO v_cnt, v_pid FROM public.product_master WHERE tenant_id = p_tenant AND lower(internal_sku) = lower(v_sku);
      IF v_cnt = 0 THEN probs := array_append(probs, ('SKU ' || v_sku || ' is not in your items: leave it blank for a new item')::text); v_pid := NULL;
      ELSIF v_cnt > 1 THEN probs := array_append(probs, ('SKU ' || v_sku || ' is used by more than one item')::text); v_pid := NULL;
      ELSE v_kind := 'update'; END IF;
      v_key := 'sku:' || lower(v_sku);
    ELSE
      SELECT internal_sku INTO v_other FROM public.product_master WHERE tenant_id = p_tenant AND lower(btrim(internal_product_name)) = lower(v_name) LIMIT 1;
      IF v_other IS NOT NULL THEN probs := array_append(probs, (('Already in your items as ' || v_other || ': add the SKU to change it'))::text); END IF;
      v_key := 'name:' || lower(v_name);
    END IF;

    -- the same item on several rows must agree on its own details
    IF seen ? v_key THEN
      IF (seen->v_key->>'category') IS DISTINCT FROM v_cat OR (seen->v_key->>'stock') IS DISTINCT FROM lower(v_stock) OR (seen->v_key->>'stock_yes') IS DISTINCT FROM v_stock_yes::text OR (seen->v_key->>'name') IS DISTINCT FROM lower(v_name) THEN
        probs := array_append(probs, (('Different item details from row ' || (seen->v_key->>'row')))::text);
      END IF;
    ELSE
      seen := seen || jsonb_build_object(v_key, jsonb_build_object('row', x->>'row', 'category', v_cat, 'stock', lower(v_stock), 'stock_yes', v_stock_yes::text, 'name', lower(v_name)));
    END IF;
    IF v_sup_canon IS NOT NULL THEN
      IF pairs ? (v_key || '|' || lower(v_sup_canon)) THEN probs := array_append(probs, (('Same item and supplier as row ' || (pairs->>(v_key || '|' || lower(v_sup_canon)))))::text);
      ELSE pairs := pairs || jsonb_build_object(v_key || '|' || lower(v_sup_canon), x->>'row'); END IF;
      -- a supplier code belongs to one item per supplier
      IF v_code <> '' THEN
        SELECT pm.internal_sku INTO v_other FROM public.product_suppliers ps JOIN public.product_master pm ON pm.id = ps.product_master_id
          WHERE ps.tenant_id = p_tenant AND lower(btrim(ps.supplier)) = lower(v_sup_canon) AND lower(btrim(ps.external_sku)) = lower(v_code)
            AND (v_pid IS NULL OR ps.product_master_id <> v_pid) LIMIT 1;
        IF v_other IS NOT NULL THEN probs := array_append(probs, (('Supplier code ' || v_code || ' is already used for ' || v_other))::text); END IF;
        IF pairs ? ('code|' || lower(v_sup_canon) || '|' || lower(v_code)) AND (pairs->>('code|' || lower(v_sup_canon) || '|' || lower(v_code))) <> v_key THEN
          probs := array_append(probs, (('Supplier code ' || v_code || ' is on another item in this file'))::text);
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

