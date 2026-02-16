
-- Update the handle_new_user_access function to include new pages
CREATE OR REPLACE FUNCTION public.handle_new_user_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_access_control (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  INSERT INTO public.user_page_permissions (user_id, page_key)
  VALUES 
    (NEW.id, 'revenue'),
    (NEW.id, 'forecast'),
    (NEW.id, 'data'),
    (NEW.id, 'activity-log'),
    (NEW.id, 'pl-report'),
    (NEW.id, 'invoices'),
    (NEW.id, 'inventory')
  ON CONFLICT (user_id, page_key) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- Add default permissions for existing users who don't have the new pages
INSERT INTO public.user_page_permissions (user_id, page_key)
SELECT uac.user_id, p.page_key
FROM public.user_access_control uac
CROSS JOIN (VALUES ('invoices'), ('inventory')) AS p(page_key)
ON CONFLICT (user_id, page_key) DO NOTHING;
