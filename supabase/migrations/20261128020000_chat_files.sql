-- Files sent to Bani chat, kept so they open again later. Private: <tenant>/<user>/<id>/<name>;
-- each person reads and adds only their own files, and only for a client they belong to.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-files', 'chat-files', false, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat_files_read" ON storage.objects;
CREATE POLICY "chat_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-files' AND (storage.foldername(name))[2] = (auth.uid())::text
         AND EXISTS (SELECT 1 FROM public.user_tenant_ids(auth.uid()) t(t) WHERE (storage.foldername(name))[1] = (t.t)::text));

DROP POLICY IF EXISTS "chat_files_insert" ON storage.objects;
CREATE POLICY "chat_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-files' AND (storage.foldername(name))[2] = (auth.uid())::text
         AND EXISTS (SELECT 1 FROM public.user_tenant_ids(auth.uid()) t(t) WHERE (storage.foldername(name))[1] = (t.t)::text));

DROP POLICY IF EXISTS "chat_files_delete" ON storage.objects;
CREATE POLICY "chat_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND (storage.foldername(name))[2] = (auth.uid())::text);
