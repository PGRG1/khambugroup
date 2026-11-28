import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { formatMenuCurrency } from "@/utils/format";

/** One supplier's order from Bani chat (built by chat-assistant orderLists.ts; prices come from the database). */
export type ChatOrderLine = { product_master_id: string | null; code: string | null; name: string; qty: number; unit: string | null; unit_price: number | null; total: number | null; not_in_master?: boolean };
export type ChatOrderList = { supplier_id: string; supplier: string; venue: string | null; delivery_date: string | null; delivery_days: string[]; min_order: number | null; lines: ChatOrderLine[]; total: number; text: string; saved_po?: string };

const HAIR = "#E6EAE7";
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Plain text of the lists, sent back to Bani as context so "make fries 12" changes the right order. */
export const orderListsContext = (lists: ChatOrderList[]) =>
  `[Order lists shown: ${lists.map(l => `${l.supplier} (supplier_id ${l.supplier_id}${l.delivery_date ? `, ${l.delivery_date}` : ""}${l.saved_po ? `, saved as ${l.saved_po}` : ""}): ${l.lines.map(x => `${x.name} ${x.qty}${x.unit ? ` ${x.unit}` : ""}${x.product_master_id ? ` [${x.product_master_id}]` : " [not in Items Master]"}`).join(", ")}`).join(" | ")}]`;

/** Bani chat: one list per supplier, ready to paste into WhatsApp or email (Copy) or keep as a draft PO (Save as PO). Nothing is sent. */
export function ChatOrderLists({ lists, onSaved }: { lists: ChatOrderList[]; onSaved: (index: number, poNumber: string) => void }) {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(lists[i].text); setCopied(i); setTimeout(() => setCopied(c => (c === i ? null : c)), 2000); }
    catch { toast.error("Couldn't copy. Select the text and copy it instead."); }
  };

  const save = async (i: number) => {
    const l = lists[i];
    if (!tenantId || !user || !l.venue) return;
    const master = l.lines.filter(x => x.product_master_id);
    if (!master.length) { toast.error("Nothing on this list is in the Items Master, so it can't be a PO yet."); return; }
    const others = l.lines.filter(x => !x.product_master_id);
    setBusy(i);
    const { data: po, error } = await supabase.from("purchase_orders").insert({
      supplier_id: l.supplier_id, venue: l.venue, expected_date: l.delivery_date, status: "draft", created_by: user.id, tenant_id: tenantId,
      total_amount: Math.round(master.reduce((n, x) => n + (x.total ?? 0), 0) * 100) / 100,
      notes: ["Made in Bani chat.", others.length ? `Also asked for (not in the Items Master): ${others.map(x => `${x.name} × ${x.qty}${x.unit ? ` ${x.unit}` : ""}`).join(", ")}` : ""].filter(Boolean).join(" "),
    } as never).select("id,po_number").single();
    if (error || !po) { setBusy(null); toast.error(error?.message ?? "The PO wasn't saved."); return; }
    const { error: itemsError } = await supabase.from("purchase_order_items").insert(master.map(x => ({
      po_id: (po as { id: string }).id, product_master_id: x.product_master_id, description: x.name, quantity_ordered: x.qty, unit: x.unit || "each", unit_price: x.unit_price ?? 0, tenant_id: tenantId,
    })) as never);
    if (itemsError) { await supabase.from("purchase_orders").delete().eq("id", (po as { id: string }).id); setBusy(null); toast.error(itemsError.message); return; }
    setBusy(null);
    onSaved(i, (po as { po_number: string }).po_number);
  };

  return <div className="mt-2 space-y-2.5">
    {lists.map((l, i) => {
      const short = l.min_order && l.total > 0 && l.total < l.min_order ? l.min_order - l.total : 0;
      return <div key={`${l.supplier_id}-${i}`} className="overflow-hidden rounded-xl border bg-white text-[13px]" style={{ borderColor: HAIR }}>
        <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <span className="min-w-0 truncate"><b className="font-semibold">{l.supplier}</b>
            <span className="text-muted-foreground"> · {l.delivery_date ? `delivery ${day(l.delivery_date)}` : "delivery day not set"}{l.delivery_days.length ? ` · delivers ${l.delivery_days.join(", ")}` : ""}</span></span>
          {l.total > 0 && <span className="shrink-0 tabular-nums">{formatMenuCurrency(l.total)}</span>}
        </div>
        <pre className="whitespace-pre-wrap px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed" style={{ background: "#FAFBFA" }}>{l.text}</pre>
        {short > 0 && <p className="px-3.5 pb-2 text-[12.5px]" style={{ color: "#B7791F" }}>Minimum order {formatMenuCurrency(l.min_order ?? 0)} · {formatMenuCurrency(short)} short</p>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3.5 py-2.5" style={{ borderTop: `1px solid ${HAIR}` }}>
          <button type="button" className="underline underline-offset-4" onClick={() => void copy(i)}>{copied === i ? "Copied" : "Copy"}</button>
          {l.saved_po
            ? <span className="text-[#1F6B5E]">✓ Saved as {l.saved_po}</span>
            : !isPreviewActive && <button type="button" className="underline underline-offset-4 disabled:no-underline disabled:opacity-50" disabled={busy !== null || !l.venue}
                title={!l.venue ? "Say which venue it's for" : undefined} onClick={() => void save(i)}>{busy === i ? "Saving…" : "Save as PO"}</button>}
          {!l.venue && !l.saved_po && <span className="text-[12.5px] text-muted-foreground">Say which venue to save it as a PO</span>}
        </div>
      </div>;
    })}
  </div>;
}
