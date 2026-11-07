import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useActiveTenant } from './useActiveTenant';
import { usePreviewMode } from './usePreviewMode';
import { fetchAllRows } from '@/utils/fetchAllRows';

export type TeamMessage = { id: string; sender_name: string; title: string; body: string; created_at: string };

export function useBaniTeamMessages(enabled = true) {
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const preview = usePreviewMode();
  const qc = useQueryClient();
  const key = ['bani-team-messages', tenantId, user?.id, preview.isPreviewActive, preview.previewUserId];
  const query = useQuery({
    queryKey: key, enabled: enabled && !!tenantId && !!user && !preview.isPreviewActive,
    staleTime: 15_000, refetchInterval: 30_000, retry: 1,
    queryFn: async (): Promise<TeamMessage[]> => {
      if (!tenantId || !user || preview.isPreviewActive) return [];
      const rows = await fetchAllRows('bani_team_messages', 'id,recipient_id,sender_name,title,body,created_at,read_at', { col: 'created_at', asc: true }, tenantId, true);
      return rows.filter(row => row.recipient_id === user.id && row.read_at === null) as TeamMessage[];
    },
  });
  const markRead = async (ids: string[]) => {
    if (!tenantId || preview.isPreviewActive || !ids.length) return;
    const { error } = await supabase.rpc('bani_team_messages_read', { p_tenant_id: tenantId, p_ids: ids });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: key });
  };
  return { ...query, unread: preview.isPreviewActive ? [] : query.data ?? [], markRead };
}