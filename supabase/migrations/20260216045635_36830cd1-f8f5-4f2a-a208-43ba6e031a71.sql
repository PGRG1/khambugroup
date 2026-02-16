
-- Position enum for user access control
CREATE TYPE public.user_position AS ENUM ('owner', 'gm', 'finance', 'staff', 'viewer');

-- User access control - one row per user
CREATE TABLE public.user_access_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  position user_position NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_user_access_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active or disabled.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_user_access_status
BEFORE INSERT OR UPDATE ON public.user_access_control
FOR EACH ROW EXECUTE FUNCTION public.validate_user_access_status();

-- Per-user, per-page permissions
CREATE TABLE public.user_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_key text NOT NULL,
  show_in_sidebar boolean NOT NULL DEFAULT true,
  can_access boolean NOT NULL DEFAULT true,
  authority text NOT NULL DEFAULT 'view_only',
  hidden_actions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key)
);

-- Validation trigger for authority
CREATE OR REPLACE FUNCTION public.validate_page_permission_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.authority NOT IN ('view_only', 'edit', 'admin') THEN
    RAISE EXCEPTION 'Invalid authority: %. Must be view_only, edit, or admin.', NEW.authority;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_page_permission_authority
BEFORE INSERT OR UPDATE ON public.user_page_permissions
FOR EACH ROW EXECUTE FUNCTION public.validate_page_permission_authority();

-- Updated_at triggers
CREATE TRIGGER update_user_access_control_updated_at
BEFORE UPDATE ON public.user_access_control
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_page_permissions_updated_at
BEFORE UPDATE ON public.user_page_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.user_access_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all access control
CREATE POLICY "Admins can select all access control"
ON public.user_access_control FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE POLICY "Admins can insert access control"
ON public.user_access_control FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update access control"
ON public.user_access_control FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete access control"
ON public.user_access_control FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Page permissions policies
CREATE POLICY "Admins and own user can select page permissions"
ON public.user_page_permissions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE POLICY "Admins can insert page permissions"
ON public.user_page_permissions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update page permissions"
ON public.user_page_permissions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete page permissions"
ON public.user_page_permissions FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Auto-create access control row for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_access_control (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Create default page permissions for all pages
  INSERT INTO public.user_page_permissions (user_id, page_key)
  VALUES 
    (NEW.id, 'revenue'),
    (NEW.id, 'forecast'),
    (NEW.id, 'data'),
    (NEW.id, 'activity-log'),
    (NEW.id, 'pl-report')
  ON CONFLICT (user_id, page_key) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_access
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_access();
