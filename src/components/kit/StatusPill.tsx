import type { ReactNode } from "react";
import { Check } from "lucide-react";
import "./kit.css";

export function StatusPill({ tone, children }: { tone: "ok" | "problem" | "neutral"; children?: ReactNode }) {
  return (
    <span className={`kit kit-pill kit-pill-${tone}`}>
      {tone === "ok" && <Check className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}
