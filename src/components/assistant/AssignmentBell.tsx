import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useVenueScope } from '@/hooks/useVenueScope';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { assignedWorkForPerson, assignmentNoticeId, assignmentReceiptKey, readAssignmentReceipts, type AssignedWork } from '@/utils/assignmentNotices';
import { useFloatingBaniStore } from './FloatingBaniContext';

const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

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
    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 rounded-full bg-transparent text-[#3D4A44] transition-colors hover:bg-transparent hover:text-[#1F3F3B] data-[state=open]:bg-transparent data-[state=open]:text-[#1F3F3B]" aria-label={`Assigned work${unread.length ? `, ${unread.length} unread` : ''}`} title="Assigned work">
      <Bell className="h-[19px] w-[19px]" strokeWidth={1.8} />
      {/* Plain bell; a small amber dot (Bani's "needs attention" colour) when something is unread. The count stays in the aria-label and the list. */}
      {unread.length > 0 && <span aria-hidden="true" className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-[#D9822B] shadow-[0_0_0_2px_hsl(var(--background))]" />}
    </Button></PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="w-80 max-w-[calc(100vw-24px)] rounded-2xl border-border/60 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(23,48,44,.22)]" aria-label="Assigned work">
      <div className="flex items-baseline justify-between px-3 pb-2 pt-2.5"><h2 className="text-sm font-semibold">Assigned to you</h2>{unread.length > 0 && <span className="text-xs text-muted-foreground">{unread.length} new</span>}</div>
      {preview.isPreviewActive ? <p className="px-3 pb-3 text-xs text-muted-foreground">Assignments are hidden in preview.</p> : query.isError ? <p role="status" className="px-3 pb-3 text-xs text-muted-foreground">Assignments couldn’t be loaded.</p> : query.isPending ? <p role="status" className="px-3 pb-3 text-xs text-muted-foreground">Loading assignments…</p> : !tasks.length ? <p className="px-3 pb-3 text-xs text-muted-foreground">No assigned work.</p> : <div className="max-h-80 overflow-y-auto">
        {tasks.map(task => {
          const id = assignmentNoticeId(task);
          const venue = scope.venues.find(v => v.id === task.venue_id)?.name;
          return <Button key={id} variant="ghost" className="h-auto w-full items-center justify-start gap-2.5 whitespace-normal rounded-[10px] px-3 py-2.5 text-left [&+&]:rounded-t-none [&+&]:border-t [&+&]:border-border/50" onClick={() => {
            if (!store || preview.isPreviewActive) return;
            store.messages[1](prev => [...prev.filter(m => m.assignmentNoticeId !== id), { role: 'assistant', assignmentNoticeId: id, content: `**${task.title}**\n\n${task.sender ? `Assigned by ${task.sender}. ` : ''}${venue ? `${venue}. ` : ''}${task.recommendation}` }]);
            store.hidden[1](false); store.open[1](true); setViewing(id); setOpen(false);
          }}>
            <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${receipts.includes(id) ? '' : 'bg-[#D9822B]'}`} />
            <span className="min-w-0 flex-1"><span className={`block truncate text-sm leading-snug ${receipts.includes(id) ? 'font-medium' : 'font-semibold'}`}>{task.title}</span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{[task.sender || 'Finance team', venue, Number.isFinite(Date.parse(task.accepted_at)) ? shortDate(task.accepted_at) : null].filter(Boolean).join(' · ')}</span>
            </span>
            <ChevronRight aria-hidden="true" className="!h-4 !w-4 shrink-0 text-muted-foreground/60" />
          </Button>;
        })}
      </div>}
    </PopoverContent>
  </Popover>;
}