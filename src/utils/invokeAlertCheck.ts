import { supabase } from '@/integrations/supabase/client';

// Retry only an authentication rejection, once, and never under a different identity.
export async function invokeAlertCheck(body: Record<string, unknown>) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('Sign in required');
  const invoke = (token: string) => supabase.functions.invoke('evaluate-alerts', {
    body, headers: { Authorization: `Bearer ${token}` },
  });
  let result = await invoke(session.access_token);
  if (result.error?.context?.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    if (!data.session || data.session.user.id !== session.user.id) throw new Error('Sign in required');
    result = await invoke(data.session.access_token);
  }
  return result;
}