import type { ReactNode } from "react";

/** Shared page top: title, then Period (left) and actions (right). */
export function PageTop({ title, titleDetail, period, actions, actionsBesideTitle = false }: { title: string; titleDetail?: ReactNode; period?: ReactNode; actions?: ReactNode; actionsBesideTitle?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0"><h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">{title}</h1>{titleDetail}</div>
        {actionsBesideTitle && actions && <div className="shrink-0">{actions}</div>}
      </div>
      {(period || (!actionsBesideTitle && actions)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">{period}</div>
          {!actionsBesideTitle && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
