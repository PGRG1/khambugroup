CREATE TABLE public.hr_person_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), employee_id uuid NOT NULL REFERENCES public.hr_employees(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.hr_person_notes TO authenticated;
GRANT ALL ON public.hr_person_notes TO service_role;
ALTER TABLE public.hr_person_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY person_notes_read ON public.hr_person_notes FOR SELECT TO authenticated USING (public.people_documents_access(tenant_id,auth.uid()) AND public.people_person_access(tenant_id,employee_id,auth.uid()));
CREATE POLICY person_notes_insert ON public.hr_person_notes FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND public.people_documents_access(tenant_id,auth.uid()) AND public.people_person_access(tenant_id,employee_id,auth.uid()));