ALTER TABLE public.stock_count_sessions ADD COLUMN IF NOT EXISTS capture_state jsonb NOT NULL DEFAULT '{"done_areas":[],"unknown":[]}'::jsonb;
ALTER TABLE public.stock_count_items ADD COLUMN IF NOT EXISTS capture_source text;
ALTER TABLE public.stock_count_items ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE public.stock_count_location_qtys ADD COLUMN IF NOT EXISTS capture_source text;
ALTER TABLE public.stock_count_location_qtys ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE public.stock_count_location_qtys ADD COLUMN IF NOT EXISTS capture_note text;
CREATE OR REPLACE FUNCTION public.stock_count_can_approve(p_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),p_tenant)) AND NOT EXISTS (SELECT 1 FROM public.user_access_control WHERE user_id=auth.uid() AND tenant_id=p_tenant AND status='disabled') AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR EXISTS (SELECT 1 FROM public.user_access_control WHERE user_id=auth.uid() AND tenant_id=p_tenant AND position IN ('owner','gm') AND status='active'));
$$;
REVOKE ALL ON FUNCTION public.stock_count_can_approve(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_count_can_approve(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.stock_count_guard_session() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'in_progress' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Start a count before sending or approving it'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='approved' THEN RAISE EXCEPTION 'Approved counts cannot be changed'; END IF;
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.venue<>OLD.venue OR NEW.count_date<>OLD.count_date OR NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'Count identity cannot be changed'; END IF;
 IF NEW.status='approved' THEN
  IF OLD.status<>'pending_review' OR NOT public.stock_count_can_approve(OLD.tenant_id) THEN RAISE EXCEPTION 'Manager or owner approval required'; END IF;
  NEW.approved_by:=auth.uid(); NEW.approved_at:=now();
 ELSIF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN RAISE EXCEPTION 'Approval details are server controlled';
 END IF;
 IF OLD.status='pending_review' AND (NEW.status<>'approved' OR NEW.capture_state IS DISTINCT FROM OLD.capture_state OR NEW.notes IS DISTINCT FROM OLD.notes) THEN RAISE EXCEPTION 'Sent counts cannot be edited'; END IF;
 IF NEW.status='pending_review' AND OLD.status='in_progress' THEN
  IF jsonb_array_length(COALESCE(NEW.capture_state->'unknown','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Identify or remove unknown items before sending'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_count_items WHERE session_id=OLD.id AND counted_qty IS NOT NULL) THEN RAISE EXCEPTION 'Count at least one item before sending'; END IF;
  IF EXISTS (SELECT 1 FROM public.stock_locations WHERE venue=OLD.venue AND is_active AND NOT (COALESCE(NEW.capture_state->'done_areas','[]'::jsonb) ? id::text)) OR (NOT EXISTS (SELECT 1 FROM public.stock_locations WHERE venue=OLD.venue AND is_active) AND NOT (COALESCE(NEW.capture_state->'done_areas','[]'::jsonb) ? 'whole')) THEN RAISE EXCEPTION 'Finish each area before sending'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_count_session_lifecycle BEFORE INSERT OR UPDATE ON public.stock_count_sessions FOR EACH ROW EXECUTE FUNCTION public.stock_count_guard_session();
CREATE OR REPLACE FUNCTION public.stock_count_guard_line() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sid uuid; tid uuid; st text;
BEGIN
 IF TG_TABLE_NAME='stock_count_items' THEN
  IF TG_OP='DELETE' THEN sid:=OLD.session_id; ELSE sid:=NEW.session_id; END IF;
 ELSE
  IF TG_OP='DELETE' THEN SELECT session_id INTO sid FROM public.stock_count_items WHERE id=OLD.count_item_id; ELSE SELECT session_id INTO sid FROM public.stock_count_items WHERE id=NEW.count_item_id; END IF;
 END IF;
 SELECT status,tenant_id INTO st,tid FROM public.stock_count_sessions WHERE id=sid FOR UPDATE;
 IF st IS DISTINCT FROM 'in_progress' THEN RAISE EXCEPTION 'Only an in-progress count can be edited'; END IF;
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
CREATE TRIGGER stock_count_item_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON public.stock_count_items FOR EACH ROW EXECUTE FUNCTION public.stock_count_guard_line();
CREATE TRIGGER stock_count_area_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON public.stock_count_location_qtys FOR EACH ROW EXECUTE FUNCTION public.stock_count_guard_line();
CREATE OR REPLACE FUNCTION public.save_stock_count_area(p_session uuid,p_area uuid,p_lines jsonb DEFAULT '[]'::jsonb,p_remove_product uuid DEFAULT NULL,p_remove_unknown text DEFAULT NULL,p_done boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.stock_count_sessions; v public.product_master; l jsonb; iid uuid; aq numeric; total_qty numeric; area_key text; state jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO s FROM public.stock_count_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.status<>'in_progress' THEN RAISE EXCEPTION 'In-progress count not found'; END IF;
 IF NOT (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),s.tenant_id)) OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Count editing access required'; END IF;
 IF EXISTS (SELECT 1 FROM public.user_access_control WHERE user_id=auth.uid() AND tenant_id=s.tenant_id AND status='disabled') THEN RAISE EXCEPTION 'Account disabled'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.venues WHERE tenant_id=s.tenant_id AND name=s.venue AND (public.is_super_admin(auth.uid()) OR public.user_has_venue(auth.uid(),id))) THEN RAISE EXCEPTION 'Venue access required'; END IF;
 IF p_area IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stock_locations WHERE id=p_area AND venue=s.venue AND is_active) THEN RAISE EXCEPTION 'Area not found'; END IF;
 IF p_area IS NULL AND EXISTS (SELECT 1 FROM public.stock_locations WHERE venue=s.venue AND is_active) THEN RAISE EXCEPTION 'Choose an area'; END IF;
 IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)>200 THEN RAISE EXCEPTION 'Invalid count lines'; END IF;
 area_key:=COALESCE(p_area::text,'whole'); state:=s.capture_state;
 IF p_remove_unknown IS NOT NULL THEN state:=jsonb_set(state,'{unknown}',COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(state->'unknown','[]'::jsonb)) x WHERE NOT (x->>'id'=p_remove_unknown AND x->>'area'=area_key)),'[]'::jsonb)); END IF;
 IF p_remove_product IS NOT NULL THEN
  SELECT id INTO iid FROM public.stock_count_items WHERE session_id=p_session AND product_master_id=p_remove_product;
  IF iid IS NOT NULL THEN
   IF p_area IS NULL THEN UPDATE public.stock_count_items SET counted_qty=NULL,capture_source=NULL,confidence=NULL,notes=NULL WHERE id=iid;
   ELSE DELETE FROM public.stock_count_location_qtys WHERE count_item_id=iid AND location_id=p_area;
    UPDATE public.stock_count_items SET counted_qty=(SELECT sum(qty) FROM public.stock_count_location_qtys WHERE count_item_id=iid) WHERE id=iid;
   END IF;
  END IF;
 END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
  IF COALESCE(l->>'source','') NOT IN ('photo','said','typed') OR COALESCE(l->>'confidence','') NOT IN ('sure','probably','cant_tell') OR length(COALESCE(l->>'note',''))>1000 THEN RAISE EXCEPTION 'Invalid source or confidence'; END IF;
  aq:=(l->>'qty')::numeric;
  IF aq<0 OR aq::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF l->>'product_master_id' IS NULL THEN
   state:=jsonb_set(state,'{unknown}',COALESCE(state->'unknown','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'area',area_key,'qty',aq,'source',l->>'source','confidence','cant_tell','note',l->>'note')));
  ELSE
   IF aq IS NULL THEN RAISE EXCEPTION 'Known item needs a quantity'; END IF;
   SELECT * INTO v FROM public.product_master WHERE id=(l->>'product_master_id')::uuid AND tenant_id=s.tenant_id AND status='Active';
   IF NOT FOUND THEN RAISE EXCEPTION 'Item not found in this tenant'; END IF;
   INSERT INTO public.stock_count_items(session_id,tenant_id,product_master_id,unit,unit_cost) VALUES(p_session,s.tenant_id,v.id,COALESCE(NULLIF(v.stock_uom,''),'each'),v.cost_per_stock_unit) ON CONFLICT(session_id,product_master_id) DO NOTHING;
   SELECT id INTO iid FROM public.stock_count_items WHERE session_id=p_session AND product_master_id=v.id;
   IF p_area IS NOT NULL THEN
    INSERT INTO public.stock_count_location_qtys(count_item_id,location_id,qty,counted_by,counted_at,capture_source,confidence,capture_note) VALUES(iid,p_area,aq,auth.uid(),now(),l->>'source',l->>'confidence',l->>'note') ON CONFLICT(count_item_id,location_id) DO UPDATE SET qty=excluded.qty,counted_by=excluded.counted_by,counted_at=excluded.counted_at,capture_source=excluded.capture_source,confidence=excluded.confidence,capture_note=excluded.capture_note;
    SELECT sum(qty) INTO total_qty FROM public.stock_count_location_qtys WHERE count_item_id=iid;
   ELSE total_qty:=aq; END IF;
   UPDATE public.stock_count_items SET counted_qty=total_qty,counted_by=auth.uid(),counted_at=now(),capture_source=l->>'source',confidence=l->>'confidence',notes=l->>'note' WHERE id=iid;
  END IF;
 END LOOP;
 state:=jsonb_set(state,'{done_areas}',COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(state->'done_areas','[]'::jsonb)) x WHERE x#>>'{}'<>area_key),'[]'::jsonb));
 IF p_done THEN state:=jsonb_set(state,'{done_areas}',(state->'done_areas')||to_jsonb(area_key)); END IF;
 UPDATE public.stock_count_sessions SET capture_state=state WHERE id=p_session;
END $$;
REVOKE ALL ON FUNCTION public.save_stock_count_area(uuid,uuid,jsonb,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_stock_count_area(uuid,uuid,jsonb,uuid,text,boolean) TO authenticated,service_role;
DROP POLICY IF EXISTS "Authenticated can view stock_count_location_qtys" ON public.stock_count_location_qtys;
DROP POLICY IF EXISTS "Admin/manager can write stock_count_location_qtys" ON public.stock_count_location_qtys;
CREATE POLICY stock_count_area_scoped_read ON public.stock_count_location_qtys FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.stock_count_items i WHERE i.id=count_item_id AND (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),i.tenant_id))));
CREATE POLICY stock_count_area_scoped_write ON public.stock_count_location_qtys FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.stock_count_items i WHERE i.id=count_item_id AND (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),i.tenant_id)) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))) WITH CHECK (EXISTS (SELECT 1 FROM public.stock_count_items i WHERE i.id=count_item_id AND (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),i.tenant_id)) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))));