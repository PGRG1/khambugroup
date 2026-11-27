-- Per-person screen settings (e.g. a table's column widths and hidden columns), so they follow the person
-- to another computer. Only the person themselves can read or change their own rows; no business data.
CREATE TABLE IF NOT EXISTS public.user_ui_prefs (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pref_key text NOT NULL CHECK (char_length(pref_key) BETWEEN 1 AND 80),
  value jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(value) < 8192),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pref_key)
);
ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_ui_prefs own" ON public.user_ui_prefs;
CREATE POLICY "user_ui_prefs own" ON public.user_ui_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.user_ui_prefs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ui_prefs TO authenticated;
