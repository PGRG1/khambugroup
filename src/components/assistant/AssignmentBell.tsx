import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useVenueScope } from '@/hooks/useVenueScope';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { formatDate, formatTableInteger } from '@/utils/format';
import { assignedWorkForPerson, assignmentNoticeId, assignmentReceiptKey, readAssignmentReceipts, type AssignedWork } from '@/utils/assignmentNotices';
import { useFloatingBaniStore } from './FloatingBaniContext';

/** Existing accepted assignments only; receipts are device-local, never task updates. */
export function AssignmentBell() {
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const preview = usePreviewMode();
  const scope = useVenueScope();
  const store = useFloatingBaniStore();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [, setReceiptVersion] = useState(0);
  const key = tenantId && user ? assignmentReceiptKey(tenantId, user.id) : '';
  useEffect(() => { setOpen(false); setViewing(null); }, [key, preview.isPreviewActive]);
  const query = useQuery({
    queryKey: ['assignment-notices', tenantId, user?.id, preview.isPreviewActive, preview.previewUserId],
    enabled: !!tenantId && !!user && !preview.isPreviewActive,
    staleTime: 15_000, refetchInterval: 30_000, retry: 1,
    queryFn: async () => {
      if (!tenantId || !user || preview.isPreviewActive) return [];
      const { data: level, error } = await supabase.rpc('access_level', { t: tenantId, area: 'finance' });
      if (error) throw error;
      if (Number(level) < 1) return [];
      const rows = await fetchAllRows('finance_team_actions', 'id,tenant_id,assignee_id,accepted_by,title,recommendation,accepted_at,status,venue_id', { col: 'accepted_at', asc: false }, tenantId, true);
      const tasks = assignedWorkForPerson(rows as AssignedWork[], tenantId, user.id);
      const allowed = await Promise.all(tasks.map(async task => {
        if (!task.venue_id) return task;
        const result = await supabase.rpc('can_see_venue', { t: tenantId, v: task.venue_id });
        if (result.error) throw result.error;
        return result.data ? task : null;
      }));
      const visible = allowed.filter((task): task is AssignedWork => task !== null);
      if (!visible.length) return [];
      const names = await supabase.from('profiles').select('user_id,display_name').in('user_id', [...new Set(visible.map(t => t.accepted_by))]);
      if (names.error) throw names.error;
      return visible.map(task => ({ ...task, sender: names.data?.find(p => p.user_id === task.accepted_by)?.display_name || null }));
    },
  });
  const receipts = key ? readAssignmentReceipts(key) : [];
  const tasks = !preview.isPreviewActive && scope.ready && !query.isError
    ? (query.data ?? []).filter(t => !t.venue_id || scope.includesId(t.venue_id)) : [];
  const unread = tasks.filter(t => !receipts.includes(assignmentNoticeId(t)));
  useEffect(() => {
    if (!viewing || !key || preview.isPreviewActive || !store?.open[0]) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      try { localStorage.setItem(key, JSON.stringify([...new Set([...readAssignmentReceipts(key), viewing])])); }
      catch { return; }
      setReceiptVersion(v => v + 1); setViewing(null); observer.disconnect();
    }, { threshold: 0.5 });
    // Home mounts its transcript after the shell effect; wait for that actual node.
    const attach = () => {
      const node = document.getElementById(`assignment-notice-${viewing}`);
      if (!node) return;
      observer.observe(node); node.scrollIntoView({ block: 'nearest' }); mutations.disconnect();
    };
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true, subtree: true });
    attach();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [viewing, key, preview.isPreviewActive, store?.open[0], store?.messages[0]]);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 rounded-full border border-transparent text-muted-foreground hover:border-[rgba(31,63,59,0.35)] hover:bg-transparent hover:text-[#1F3F3B] data-[state=open]:border-[rgba(31,63,59,0.35)] data-[state=open]:bg-transparent data-[state=open]:text-[#1F3F3B]" aria-label={`Assigned work${unread.length ? `, ${unread.length} unread` : ''}`} title="Assigned work">
      <Bell className="h-4 w-4" />
      {unread.length > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground td-num">{formatTableInteger(unread.length)}</span>}
    </Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-24px)] p-3" aria-label="Assigned work">
      <h2 className="mb-2 text-sm font-medium">Assigned to you</h2>
      {preview.isPreviewActive ? <p className="text-xs text-muted-foreground">Assignments are hidden in preview.</p> : query.isError ? <p role="status" className="text-xs text-muted-foreground">Assignments couldn’t be loaded.</p> : query.isPending ? <p role="status" className="text-xs text-muted-foreground">Loading assignments…</p> : !tasks.length ? <p className="text-xs text-muted-foreground">No assigned work.</p> : <div className="max-h-80 overflow-y-auto">
        {tasks.map(task => {
          const id = assignmentNoticeId(task);
          const venue = scope.venues.find(v => v.id === task.venue_id)?.name;
          return <Button key={id} variant="ghost" className="h-auto w-full items-start justify-start whitespace-normal px-2 py-3 text-left" onClick={() => {
            if (!store || preview.isPreviewActive) return;
            store.messages[1](prev => [...prev.filter(m => m.assignmentNoticeId !== id), { role: 'assistant', assignmentNoticeId: id, content: `**${task.title}**\n\n${task.sender ? `Assigned by ${task.sender}. ` : ''}${venue ? `${venue}. ` : ''}${task.recommendation}` }]);
            store.hidden[1](false); store.open[1](true); setViewing(id); setOpen(false);
          }}>
            <span className="min-w-0 space-y-1"><span className={`block text-sm ${receipts.includes(id) ? 'font-normal' : 'font-semibold'}`}>{task.title}</span>
              <span className="block text-xs text-muted-foreground">{task.sender ? `From ${task.sender} · ` : ''}{venue || 'Finance team'}</span>
              {Number.isFinite(Date.parse(task.accepted_at)) && <span className="block text-[11px] text-muted-foreground">{formatDate(task.accepted_at)}</span>}
            </span>
          </Button>;
        })}
      </div>}
    </PopoverContent>
  </Popover>;
}