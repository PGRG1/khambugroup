
CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES ('00000000-0000-0000-0000-00000000beef', NEW.id, 'member')
  ON CONFLICT (tenant_id, user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
