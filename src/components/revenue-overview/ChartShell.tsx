import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartShell({ title, subtitle, headerRight, children, className = "" }: Props) {
  return (
    <div className={`card-glass rounded-xl border border-border/60 p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
        </div>
        {headerRight && (
          <div className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{headerRight}</div>
        )}
      </div>
      {children}
    </div>
  );
}
