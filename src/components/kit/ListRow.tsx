import type { ReactNode } from "react";
import "./kit.css";

export type ListRowState = "normal" | "attention" | "missing";

/** 44px list row. `open` marks the row shown in the detail panel. */
export function ListRow({ state = "normal", open, onClick, children, className = "" }: { state?: ListRowState; open?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = `kit kit-row ${state === "attention" ? "kit-row-attention" : state === "missing" ? "kit-row-missing" : ""} ${open ? "kit-row-open" : ""} ${className}`;
  if (onClick) return <button type="button" className={cls} onClick={onClick} aria-expanded={open}>{children}</button>;
  return <div className={cls}>{children}</div>;
}
