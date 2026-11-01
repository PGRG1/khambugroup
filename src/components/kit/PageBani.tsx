import { useState } from "react";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import { useBaniTopic } from "@/components/assistant/FloatingBaniContext";
import type { PageWorkItem } from "@/utils/baniPageWork";
import { PageTopPortal } from "./PageTopSlots";

export type BaniFinding = PageWorkItem & { group?: string; groupTitle?: (n: number) => string; onOpen?: () => void };

/** Collapse findings of the same kind (e.g. one per person) into one finding. */
export function groupFindings(findings: BaniFinding[]): BaniFinding[] {
  const out: BaniFinding[] = [], seen = new Map<string, BaniFinding[]>();
  for (const f of findings) {
    if (!f.group) { out.push(f); continue; }
    const list = seen.get(f.group);
    if (list) { list.push(f); continue; }
    const fresh = [f]; seen.set(f.group, fresh); out.push({ ...f, id: `group-${f.group}` });
  }
  return out.map((f) => {
    const list = f.group ? seen.get(f.group)! : null;
    if (!list || list.length === 1) return list ? list[0] : f;
    const title = list[0].groupTitle?.(list.length) ?? `${list.length} items: ${list[0].title}`;
    return { ...f, title, detail: list.map((x) => x.title).slice(0, 6).join(" · "), question: `${title}. Go through them one by one:\n${list.slice(0, 12).map((x) => x.question).filter(Boolean).join("\n")}` };
  });
}

/** Bani card: orb + "Bani", one finding visible, the rest folded into "N more: …". Sits in the PageTop Bani slot. */
export function PageBani({ findings, portal = true }: { findings: BaniFinding[]; portal?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const topic = useBaniTopic();
  const items = groupFindings(findings);
  if (!items.length) return null;
  const shown = expanded ? items : items.slice(0, 1);
  const card = (
    <section className="page-bani people-findings glass-surface border border-border rounded-lg px-4 py-3" aria-label="Bani findings">
      <div className="flex items-start gap-3">
        <BaniOrb size={22} mode="idle" className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-sm leading-6">Bani</h2>
          {shown.map((f) => (
            <button key={f.id} type="button" className="bani-finding block w-full text-left text-sm py-0.5 hover:underline" onClick={() => (f.onOpen ? f.onOpen() : f.question && topic(f.question))}>
              {f.title}{f.id.endsWith("-conflict") ? ` · ${f.detail}` : ""}
            </button>
          ))}
          {items.length > 1 && (
            <button type="button" className="bani-fold block w-full truncate text-left text-xs text-muted-foreground py-0.5" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show less" : `${items.length - 1} more: ${items.slice(1, 3).map((f) => f.title).join(" · ")}${items.length > 3 ? " …" : ""}`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
  return portal ? <PageTopPortal slot="bani">{card}</PageTopPortal> : card;
}
