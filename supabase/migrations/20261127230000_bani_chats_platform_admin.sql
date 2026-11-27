-- Bani team (platform admins) working inside a client are not members of that client, so their chats there were never
-- saved and Chat history came back empty after a reload. Their own chats in any client are now kept, still only theirs.
DROP POLICY IF EXISTS "Own chats: add" ON public.bani_chats;
CREATE POLICY "Own chats: add" ON public.bani_chats FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid())));
DROP POLICY IF EXISTS "Own chats: change" ON public.bani_chats;
CREATE POLICY "Own chats: change" ON public.bani_chats FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid())));
DROP POLICY IF EXISTS "Own chats: read" ON public.bani_chats;
CREATE POLICY "Own chats: read" ON public.bani_chats FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid())));
