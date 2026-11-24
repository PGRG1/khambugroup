import { supabase } from '@/integrations/supabase/client';

/** Retry only a pre-write authentication rejection, once, as the same person. */
export async function invokeCreateUser(body: Record<string, unknown>) {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new Error('Please sign in again before managing people.');
    const invoke = (token: string) => supabase.functions.invoke('create-user', {
      body, headers: { Authorization: `Bearer ${token}` },
    });
    let result = await invoke(session.access_token);
    let rejected = result.error?.context?.status === 401 || result.data?.error === 'Unauthorized';
    // Older deployments returned authentication errors as 400s. Inspect a copy so callers can still read it.
    if (!rejected && result.error?.context instanceof Response && result.error.context.status === 400) {
      const failure = await result.error.context.clone().json().catch(() => null);
      rejected = failure?.error === 'Unauthorized';
    }
    if (rejected) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !data.session || data.session.user.id !== session.user.id) {
        throw new Error('Please sign in again before managing people.');
      }
      result = await invoke(data.session.access_token);
    }
    return result;
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Could not manage this person. Please try again.') };
  }
}