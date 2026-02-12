
-- Create audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_display_name text,
  action text NOT NULL, -- 'insert', 'update', 'delete', 'bulk_upload', 'bulk_delete'
  entity_type text NOT NULL, -- 'sales_record', 'forecast'
  entity_id text, -- identifier for the record (e.g. date-venue-report)
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read audit logs
CREATE POLICY "Authenticated users can read audit logs"
  ON public.audit_log FOR SELECT
  USING (true);

-- Authenticated users can insert audit logs
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_entity_type ON public.audit_log (entity_type);
