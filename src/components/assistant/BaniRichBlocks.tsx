import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";

// Presentation only: these never change the figures Bani wrote, they only lay them out.

/** Plain text of rendered React children (used for variance detection). */
export function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

/** "+4.2%", "−HK$ 12,000", "(3.1%)" → direction; anything else → null. */
export function varianceDirection(raw: string): "up" | "down" | null {
  const v = raw.trim();
  if (!/\d/.test(v) || v.length > 24) return null;
  if (/^\(.*\)$/.test(v)) return "down";
  if (/^[+▲↑]/.test(v)) return "up";
  if (/^[-−▼↓]/.test(v)) return "down";
  return null;
}

/** First cell "Total…" / "Net…" / "Gross profit…" marks an accounting summary row. */
export function isSummaryLabel(raw: string): boolean {
  return /^(total|subtotal|net |gross profit|profit|grand total)/i.test(raw.trim());
}

export function FinancialTable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const rows = Array.from(ref.current?.rows ?? []).map(r => Array.from(r.cells).map(c => (c.textContent ?? "").replace(/\s+/g, " ").trim()).join("\t"));
    try { await navigator.clipboard.writeText(rows.join("\n")); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  return <div className="floating-bani-table-block">
    <div className="floating-bani-table-wrap" role="region" aria-label="Financial comparison" tabIndex={0}><table ref={ref}>{children}</table></div>
    <button type="button" className="floating-bani-table-copy" onClick={() => void copy()} aria-label="Copy table for Excel">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy to Excel"}
    </button>
  </div>;
}

/** ```stats block: one "Label | Value | optional note" per line → executive chips. */
export function StatChips({ source }: { source: string }) {
  const items = source.split("\n").map(l => l.split("|").map(s => s.trim())).filter(p => p[0] && p[1]).slice(0, 4);
  if (!items.length) return null;
  return <div className="floating-bani-stats">{items.map(([label, value, note], i) => {
    const dir = note ? varianceDirection(note) : null;
    return <div key={i} className="floating-bani-stat">
      <span className="floating-bani-stat-label">{label}</span>
      <span className="floating-bani-stat-value td-num">{value}</span>
      {note && <span className={`floating-bani-stat-note ${dir ? `is-${dir}` : ""}`}>{note}</span>}
    </div>;
  })}</div>;
}

/** ```calc block: workings folded away behind one toggle. */
export function CalcBreakdown({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  return <div className="floating-bani-calc">
    <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />{open ? "Hide calculation" : "Show calculation"}
    </button>
    {open && <pre className="td-num">{source.trim()}</pre>}
  </div>;
}

export function VarianceCell({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  const dir = varianceDirection(textOf(children));
  const num = style?.textAlign === "right" || dir;
  return <td style={style} className={num ? "td-num" : undefined}>{dir ? <span className={`floating-bani-pill is-${dir}`}>{children}</span> : children}</td>;
}

export function SummaryRow({ children }: { children: ReactNode }) {
  const first = Array.isArray(children) ? children.find(c => c && typeof c === "object") : children;
  return <tr className={isSummaryLabel(textOf(first)) ? "is-total" : undefined}>{children}</tr>;
}

/** ```daypicker block: "YYYY-MM-DD | label" per line → tap Closed/Traded, then send the choices back as the user's reply. */
export function DayPicker({ source, onSend }: { source: string; onSend?: (text: string) => void }) {
  const days = source.split("\n").map(l => l.split("|").map(s => s.trim())).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p[0])).map(([iso, label]) => ({ iso, label: label || iso })).slice(0, 62);
  const [pick, setPick] = useState<Record<string, "closed" | "traded">>({});
  const [sent, setSent] = useState(false);
  if (!days.length) return null;
  const all = (v: "closed" | "traded") => setPick(Object.fromEntries(days.map(d => [d.iso, v])));
  const done = days.every(d => pick[d.iso]);
  const send = () => {
    const g = (v: string) => days.filter(d => pick[d.iso] === v).map(d => d.label).join(", ") || "none";
    setSent(true);
    onSend?.(`Closed: ${g("closed")}. Traded: ${g("traded")}.`);
  };
  return <div className="floating-bani-daypicker">
    {days.map(d => <div key={d.iso} className="floating-bani-daypicker-row">
      <span>{d.label}</span>
      <span className="floating-bani-daypicker-opts">
        {(["closed", "traded"] as const).map(v => <button key={v} type="button" disabled={sent} aria-pressed={pick[d.iso] === v}
          className="floating-bani-reply" onClick={() => setPick(p => ({ ...p, [d.iso]: v }))}>{v === "closed" ? "Closed" : "Traded"}</button>)}
      </span>
    </div>)}
    {!sent && <div className="floating-bani-daypicker-foot">
      <button type="button" className="floating-bani-reply" onClick={() => all("closed")}>All closed</button>
      <button type="button" className="floating-bani-reply" onClick={() => all("traded")}>All traded</button>
      <button type="button" className="floating-bani-reply is-primary" disabled={!done} onClick={send}>Send</button>
    </div>}
  </div>;
}
