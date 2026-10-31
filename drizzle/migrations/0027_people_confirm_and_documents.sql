CREATE FUNCTION public.confirm_people_change(t uuid,e uuid,d date,p jsonb,kind text,doc uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid();v uuid;mode text;cid uuid;k text;n numeric;
BEGIN
IF NOT public.people_access(t,uid) THEN RAISE EXCEPTION 'People access required';END IF;
IF d IS NULL OR jsonb_typeof(p)<>'object' OR kind NOT IN ('joined','probation_passed','promotion','pay_change','type_change','venue_move','left','details','contract') THEN RAISE EXCEPTION 'Invalid person change';END IF;
IF e IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_employees WHERE tenant_id=t AND id=e) THEN RAISE EXCEPTION 'Person unavailable';END IF;
FOR k IN SELECT jsonb_object_keys(p) LOOP IF k NOT IN ('first_name','last_name','job_title','employment_type','venue_id','venue','hire_date','end_date','status','email','phone','pay_amount','pay_basis','weekly_hours','annual_leave','probation_months','notice_days') THEN RAISE EXCEPTION 'Unknown person field';END IF;END LOOP;
IF p ? 'employment_type' AND p->>'employment_type' NOT IN ('full_time','part_time','casual') OR p ? 'pay_basis' AND p->>'pay_basis' NOT IN ('month','hour') OR p ? 'status' AND p->>'status' NOT IN ('active','on_leave','resigned','terminated','inactive') THEN RAISE EXCEPTION 'Invalid terms';END IF;
FOREACH k IN ARRAY ARRAY['pay_amount','weekly_hours','annual_leave','probation_months','notice_days'] LOOP IF p ? k THEN n:=(p->>k)::numeric;IF n IS NULL OR n<0 OR n>10000000 THEN RAISE EXCEPTION 'Invalid amount';END IF;END IF;END LOOP;
v:=NULLIF(p->>'venue_id','')::uuid;IF v IS NULL AND e IS NOT NULL THEN SELECT venue_id INTO v FROM public.hr_employees WHERE id=e AND tenant_id=t;END IF;
IF v IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.venues WHERE id=v AND tenant_id=t AND is_active) THEN RAISE EXCEPTION 'Choose an active venue';END IF;
IF p ? 'venue_id' THEN p:=p||jsonb_build_object('venue',(SELECT name FROM public.venues WHERE id=v AND tenant_id=t));END IF;
IF e IS NULL AND (COALESCE(p->>'first_name','')='' OR COALESCE(p->>'last_name','')='' OR v IS NULL) THEN RAISE EXCEPTION 'Name and real venue required';END IF;
IF doc IS NOT NULL AND (NOT public.people_documents_access(t,uid) OR NOT EXISTS(SELECT 1 FROM public.hr_person_documents WHERE id=doc AND tenant_id=t AND employee_id=e)) THEN RAISE EXCEPTION 'Document unavailable';END IF;
IF p ? 'pay_amount' AND NOT public.people_owner(t,uid) AND NOT (public.people_effective_settings(t,v)->>'managers_change_pay')::boolean THEN RAISE EXCEPTION 'Manager pay changes are disabled';END IF;
mode:=public.people_effective_settings(t,v)->>'approvals';
INSERT INTO public.hr_people_changes(tenant_id,employee_id,effective_date,values,change_type,approval_mode,created_by,document_id) VALUES(t,e,d,p,kind,mode,uid,doc) RETURNING id INTO cid;
IF mode='owner_run' AND public.people_owner(t,uid) THEN PERFORM public.approve_people_change(cid,true);END IF;
RETURN cid;END $$;
CREATE FUNCTION public.approve_people_change(c uuid,yes boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.hr_people_changes%ROWTYPE;uid uuid:=auth.uid();eid uuid;emp public.hr_employees%ROWTYPE;k text;old jsonb;
BEGIN SELECT * INTO r FROM public.hr_people_changes WHERE id=c FOR UPDATE;
IF NOT FOUND OR NOT public.people_owner(r.tenant_id,uid) OR NOT public.people_access(r.tenant_id,uid) THEN RAISE EXCEPTION 'Owner approval required';END IF;
IF r.status<>'pending' THEN RAISE EXCEPTION 'Change already reviewed';END IF;
IF r.approval_mode='strict' AND r.created_by=uid THEN RAISE EXCEPTION 'A different owner must approve';END IF;
IF NOT yes THEN UPDATE public.hr_people_changes SET status='rejected',approved_by=uid,approved_at=now() WHERE id=c;RETURN;END IF;
eid:=r.employee_id;
IF eid IS NULL THEN INSERT INTO public.hr_employees(tenant_id,first_name,last_name,job_title,employment_type,venue_id,venue,hire_date,status) VALUES(r.tenant_id,r.values->>'first_name',r.values->>'last_name',r.values->>'job_title',COALESCE(r.values->>'employment_type','full_time'),(r.values->>'venue_id')::uuid,r.values->>'venue',COALESCE((r.values->>'hire_date')::date,r.effective_date),COALESCE(r.values->>'status','active')) RETURNING id INTO eid;UPDATE public.hr_people_changes SET employee_id=eid WHERE id=c;
ELSE SELECT * INTO emp FROM public.hr_employees WHERE id=eid AND tenant_id=r.tenant_id FOR UPDATE;old:=to_jsonb(emp);END IF;
INSERT INTO public.hr_employment_terms(tenant_id,employee_id,effective_date,values,created_by,approved_by) VALUES(r.tenant_id,eid,r.effective_date,r.values,r.created_by,uid);
FOR k IN SELECT jsonb_object_keys(r.values) LOOP INSERT INTO public.hr_employee_history(tenant_id,employee_id,effective_date,change_type,field_changed,old_value,new_value,created_by,approved_by,document_id,change_id) VALUES(r.tenant_id,eid,r.effective_date,r.change_type,k,old->>k,r.values->>k,r.created_by,uid,r.document_id,c);END LOOP;
IF r.effective_date<=(now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN UPDATE public.hr_employees SET first_name=COALESCE(r.values->>'first_name',first_name),last_name=COALESCE(r.values->>'last_name',last_name),job_title=COALESCE(r.values->>'job_title',job_title),employment_type=COALESCE(r.values->>'employment_type',employment_type),venue_id=COALESCE((r.values->>'venue_id')::uuid,venue_id),venue=COALESCE(r.values->>'venue',venue),status=COALESCE(r.values->>'status',status),hire_date=COALESCE((r.values->>'hire_date')::date,hire_date),end_date=COALESCE((r.values->>'end_date')::date,end_date),email=COALESCE(r.values->>'email',email),phone=COALESCE(r.values->>'phone',phone),updated_at=now() WHERE id=eid AND tenant_id=r.tenant_id;END IF;
UPDATE public.hr_people_changes SET status='approved',approved_by=uid,approved_at=now() WHERE id=c;END $$;
CREATE FUNCTION public.register_people_document(t uuid,e uuid,k text,p text,n text,m text,expiry date DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev uuid;ver integer;id uuid;
BEGIN IF NOT public.people_documents_access(t,auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.hr_employees WHERE tenant_id=t AND id=e) THEN RAISE EXCEPTION 'Documents access required';END IF;
IF k NOT IN ('contract','id','permit','sick_note','letter') OR m NOT IN ('application/pdf','image/jpeg','image/png','image/webp') OR p NOT LIKE t::text||'/'||e::text||'/%' OR n='' THEN RAISE EXCEPTION 'Invalid document';END IF;
IF k='sick_note' AND NOT (public.people_effective_settings(t,(SELECT venue_id FROM public.hr_employees WHERE id=e))->>'sick_notes')::boolean THEN RAISE EXCEPTION 'Sick notes disabled';END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(t::text||e::text||k,0));SELECT d.id,d.version+1 INTO prev,ver FROM public.hr_person_documents d WHERE tenant_id=t AND employee_id=e AND kind=k ORDER BY version DESC LIMIT 1;
INSERT INTO public.hr_person_documents(tenant_id,employee_id,kind,storage_path,file_name,mime_type,expiry_date,version,previous_id,created_by) VALUES(t,e,k,p,n,m,expiry,COALESCE(ver,1),prev,auth.uid()) RETURNING hr_person_documents.id INTO id;RETURN id;END $$;
CREATE POLICY hr_private_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='hr-private-documents' AND public.people_documents_access((storage.foldername(name))[1]::uuid,auth.uid()));
CREATE POLICY hr_private_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='hr-private-documents' AND public.people_documents_access((storage.foldername(name))[1]::uuid,auth.uid()) AND EXISTS(SELECT 1 FROM public.hr_employees WHERE tenant_id=(storage.foldername(name))[1]::uuid AND id=(storage.foldername(name))[2]::uuid));
REVOKE ALL ON FUNCTION public.confirm_people_change(uuid,uuid,date,jsonb,text,uuid),public.approve_people_change(uuid,boolean),public.register_people_document(uuid,uuid,text,text,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_people_change(uuid,uuid,date,jsonb,text,uuid),public.approve_people_change(uuid,boolean),public.register_people_document(uuid,uuid,text,text,text,text,date) TO authenticated;