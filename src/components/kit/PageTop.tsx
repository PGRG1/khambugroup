import type { ReactNode } from "react";

/** Shared page top: title, then Period (left) and actions (right). */
export function PageTop({ title, period, actions }: { title: string; period?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">{title}</h1>
      {(period || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">{period}</div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
