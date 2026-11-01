import type { ReactNode } from "react";
import { useLocation } from 'react-router-dom';
import { useFloatingBaniStore } from '@/components/assistant/FloatingBaniContext';
import { BaniFindings } from './BaniFindings';
import { usePageTopControls } from './PageTopControls';
import './page-top.css';
import { useBaniPageWork } from '@/hooks/useBaniPageWork';

/** One title row, one wrapping controls row, then existing scoped Bani findings. */
export function PageTop({ title, titleDetail, period, controls, actions, primaryAction, leading, actionsBesideTitle = false, showBani = true }: { title: ReactNode; titleDetail?: ReactNode; period?: ReactNode; controls?: ReactNode; actions?: ReactNode; primaryAction?: ReactNode; leading?: ReactNode; actionsBesideTitle?: boolean; showBani?: boolean }) {
  const host = usePageTopControls(), store = useFloatingBaniStore(), { pathname } = useLocation();
  const published = store?.work[0];
  const existingWork = useBaniPageWork(pathname, false);
  const findings = published?.path === pathname ? published.items : existingWork.items;
  return (
    <div className="page-top space-y-3 min-w-0">
      <div className="page-top-title flex items-center justify-between gap-3 min-h-9">
        <div className="flex items-center gap-3 min-w-0">{leading}<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0"><h1 className="text-xl sm:text-2xl font-display font-semibold">{title}</h1>{titleDetail && <div className="page-top-detail text-sm text-muted-foreground min-w-0">{titleDetail}</div>}</div></div>
        {(primaryAction || actionsBesideTitle && actions) && <div className="page-top-primary shrink-0">{primaryAction || actions}</div>}
      </div>
      <div className="page-top-controls flex flex-wrap items-center gap-2 min-h-9" aria-label="Page controls">
        <div className="page-top-left flex flex-wrap items-center gap-2 min-w-0">{period}{controls}<div ref={host?.setLeft} className="page-top-controls-left-host flex flex-wrap items-center gap-2 min-w-0 empty:hidden" /></div>
        <div className="page-top-right flex flex-wrap items-center gap-2 min-w-0 ml-auto">{!actionsBesideTitle && actions}<div ref={host?.setTarget} className="page-top-controls-host flex flex-wrap items-center gap-2 min-w-0 empty:hidden" /></div>
      </div>
      {showBani && <BaniFindings findings={findings} />}
    </div>
  );
}
