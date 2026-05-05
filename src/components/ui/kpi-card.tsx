import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Trend percentage vs comparison period. Positive = up. */
  trend?: number | null;
  /** Comparison label (e.g. "vs last month"). */
  trendLabel?: string;
  /** Tone for trend coloring. By default `auto` uses positive=success. Set `inverse` if a decrease is good (e.g. cost). */
  trendDirection?: "auto" | "inverse";
  className?: string;
}

/**
 * Standard KPI card. Use everywhere a number metric is shown in a card grid.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  trendDirection = "auto",
  className,
}: KpiCardProps) {
  const positive = trend != null && trend > 0;
  const negative = trend != null && trend < 0;
  const goodIsUp = trendDirection === "auto";
  const tone =
    trend == null || trend === 0
      ? "muted"
      : (positive && goodIsUp) || (negative && !goodIsUp)
        ? "success"
        : "danger";

  const TrendIcon = trend == null || trend === 0 ? Minus : positive ? TrendingUp : TrendingDown;

  return (
    <div className={cn("card-glass rounded-xl p-3 sm:p-4 min-w-0 animate-fade-in", className)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <p className="font-display text-lg sm:text-2xl font-semibold leading-tight text-foreground tabular-nums truncate">
        {value}
      </p>
      {trend != null && (
        <div
          className={cn(
            "mt-1.5 flex items-center gap-1 text-[10px] sm:text-xs font-medium",
            tone === "success" && "text-success",
            tone === "danger" && "text-destructive",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          <TrendIcon className="h-3 w-3" />
          <span>{Math.abs(trend).toFixed(1)}%</span>
          {trendLabel && <span className="text-muted-foreground font-normal truncate">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}

interface KpiGridProps {
  children: React.ReactNode;
  className?: string;
  /** Tailwind column count override; default responsive 2/4. */
  cols?: string;
}

export function KpiGrid({ children, className, cols }: KpiGridProps) {
  return (
    <div className={cn("grid gap-2 sm:gap-3", cols ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}
