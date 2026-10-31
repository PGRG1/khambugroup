CREATE OR REPLACE FUNCTION public.stock_count_can_approve(p_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),p_tenant)) AND NOT EXISTS (SELECT 1 FROM public.user_access_control WHERE user_id=auth.uid() AND tenant_id=p_tenant AND status='disabled') AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR EXISTS (SELECT 1 FROM public.user_access_control WHERE user_id=auth.uid() AND tenant_id=p_tenant AND position IN ('owner','gm') AND status='active')); $$;
CREATE POLICY stock_count_owner_review ON public.stock_count_sessions FOR UPDATE TO authenticated USING (status='pending_review' AND public.stock_count_can_approve(tenant_id)) WITH CHECK (status='approved' AND public.stock_count_can_approve(tenant_id));
CREATE OR REPLACE FUNCTION public.stock_count_unit_fill() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN IF NEW.unit='each' THEN SELECT COALESCE(NULLIF(stock_uom,''),NULLIF(unit,''),'each') INTO NEW.unit FROM public.product_master WHERE id=NEW.product_master_id; END IF; RETURN NEW; END $$;
CREATE TRIGGER stock_count_unit_default BEFORE INSERT ON public.stock_count_items FOR EACH ROW EXECUTE FUNCTION public.stock_count_unit_fill();
CREATE OR REPLACE FUNCTION public.stock_count_guard_line() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sid uuid; tid uuid; st text;
BEGIN
 IF TG_TABLE_NAME='stock_count_items' THEN IF TG_OP='DELETE' THEN sid:=OLD.session_id; ELSE sid:=NEW.session_id; END IF;
 ELSE IF TG_OP='DELETE' THEN SELECT session_id INTO sid FROM public.stock_count_items WHERE id=OLD.count_item_id; ELSE SELECT session_id INTO sid FROM public.stock_count_items WHERE id=NEW.count_item_id; END IF; END IF;
 SELECT status,tenant_id INTO st,tid FROM public.stock_count_sessions WHERE id=sid FOR UPDATE;
 IF TG_OP='DELETE' AND st IS NULL THEN RETURN OLD; END IF;
 IF st IS DISTINCT FROM 'in_progress' THEN RAISE EXCEPTION 'Only an in-progress count can be edited'; END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='stock_count_items' AND (NEW.session_id<>OLD.session_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN RAISE EXCEPTION 'Count item identity cannot be changed'; END IF;
  IF TG_TABLE_NAME='stock_count_location_qtys' AND (NEW.count_item_id<>OLD.count_item_id OR NEW.location_id<>OLD.location_id) THEN RAISE EXCEPTION 'Area item identity cannot be changed'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='stock_count_items' THEN
  IF NOT EXISTS (SELECT 1 FROM public.product_master WHERE id=NEW.product_master_id AND tenant_id=tid) THEN RAISE EXCEPTION 'Item belongs to another tenant'; END IF;
  IF NEW.counted_qty<0 THEN RAISE EXCEPTION 'Quantity must not be negative'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='stock_count_location_qtys' THEN
  IF NEW.qty<0 THEN RAISE EXCEPTION 'Quantity must not be negative'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_locations l JOIN public.stock_count_sessions s ON s.venue=l.venue WHERE s.id=sid AND l.id=NEW.location_id AND l.is_active) THEN RAISE EXCEPTION 'Area does not belong to this count'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;