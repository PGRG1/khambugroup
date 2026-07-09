// Shared tone system for KPI pages — token-driven, no hardcoded palette.
// success = primary, danger = destructive, warn = warning, info = info, neutral = muted.

export type Tone = "success" | "info" | "warn" | "danger" | "neutral";

export const tonePill: Record<Tone, string> = {
  success: "bg-primary/10 text-primary ring-1 ring-primary/25",
  info: "bg-info/10 text-info ring-1 ring-info/30",
  warn: "bg-warning/10 text-warning ring-1 ring-warning/30",
  danger: "bg-destructive/10 text-destructive ring-1 ring-destructive/25",
  neutral: "bg-muted text-muted-foreground ring-1 ring-border",
};

export const toneBar: Record<Tone, string> = {
  success: "bg-primary",
  info: "bg-info",
  warn: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/50",
};

export const toneText: Record<Tone, string> = {
  success: "text-primary",
  info: "text-info",
  warn: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
};

export const toneSoft: Record<Tone, string> = {
  success: "bg-primary/5 text-primary",
  info: "bg-info/5 text-info",
  warn: "bg-warning/5 text-warning",
  danger: "bg-destructive/5 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export const toneTile: Record<Tone, string> = {
  success: "bg-primary/[0.06] border-primary/25 text-foreground",
  info: "bg-info/[0.06] border-info/30 text-foreground",
  warn: "bg-warning/[0.06] border-warning/30 text-foreground",
  danger: "bg-destructive/[0.06] border-destructive/25 text-foreground",
  neutral: "bg-card border-border text-foreground",
};

export const toneTileLabel: Record<Tone, string> = {
  success: "text-primary",
  info: "text-info",
  warn: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
};

// Convenience: for external code that uses arbitrary strings.
export function asTone(t: string | undefined | null): Tone {
  if (t === "success" || t === "info" || t === "warn" || t === "danger" || t === "neutral") return t;
  return "neutral";
}
