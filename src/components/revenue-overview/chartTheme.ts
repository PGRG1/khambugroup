// Shared tokenized chart primitives for revenue-overview.
// Everything here uses CSS variables so charts respect the design system.

export const chartAxis = {
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  axisLine: false as const,
  tickLine: false as const,
};

export const chartGrid = {
  stroke: "hsl(var(--border))",
  strokeOpacity: 0.3,
  strokeDasharray: "2 4",
  vertical: false as const,
} as const;

export const chartTooltipContentStyle: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
  boxShadow: "0 4px 20px -4px hsl(var(--background) / 0.4)",
};

export const chartLegendStyle: React.CSSProperties = {
  fontSize: 11,
  color: "hsl(var(--muted-foreground))",
};

// Single-hue stepped opacities so multi-series (months) stay distinguishable
// while the page reads as one calm palette.
const MONTH_OPACITY_STOPS = [1, 0.7, 0.45, 0.28, 0.18, 0.12, 0.09, 0.07];
export function monthOpacity(idx: number): number {
  return MONTH_OPACITY_STOPS[idx] ?? Math.max(0.06, MONTH_OPACITY_STOPS[MONTH_OPACITY_STOPS.length - 1] - 0.01 * (idx - MONTH_OPACITY_STOPS.length));
}

export const PRIMARY = "hsl(var(--primary))";
export const DESTRUCTIVE = "hsl(var(--destructive))";
export const FG = "hsl(var(--foreground))";
export const MUTED_FG = "hsl(var(--muted-foreground))";
export const BORDER = "hsl(var(--border))";

export function compactHK(v: number): string {
  const n = Number(v);
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `${Math.round(n)}`;
}
