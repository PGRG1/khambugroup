import { ArrowUp, ArrowDown } from "lucide-react";
import { fmtPct } from "./utils";

interface Props {
  value: number | null;
  invert?: boolean; // if true, positive = bad (e.g. discount rate)
  suffix?: string;
  className?: string;
}

export function DeltaChip({ value, invert = false, suffix = "vs prior", className = "" }: Props) {
  if (value === null || !isFinite(value)) return null;
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  const tone = good
    ? "bg-primary/10 text-primary"
    : "bg-destructive/10 text-destructive";
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${tone} ${className}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {fmtPct(Math.abs(value))}
      {suffix && <span className="ml-1 text-[10px] font-normal opacity-70">{suffix}</span>}
    </span>
  );
}
