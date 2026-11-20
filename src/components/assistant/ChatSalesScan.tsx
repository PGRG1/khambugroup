import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { applySalesFigure, ChatSalesCard, type ChatSalesPhase, type SalesFigure } from "@/components/sales/ChatSalesCard";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useVenues } from "@/hooks/useVenues";
import type { SalesRecord } from "@/types/sales";
import { deferredSalesAmounts } from "@/utils/deferredSales";
import { readSalesReceipt } from "@/utils/salesReceiptRead";
import { saveReceiptIntake } from "@/utils/salesReceiptIntake";
import { shortDay } from "@/utils/salesRecordChecks";
import { formatMoney } from "@/utils/money";
import type { SalesHandoff } from "@/utils/scannerHandoff";

/** Anything the chat card can't settle goes to the full Scan Receipt review. */
export function needsFullSalesReview(r: SalesRecord): boolean {
  if (r.lines) return true; // clients set up line by line keep the full review for now
  try { const d = deferredSalesAmounts(r); if (d.sold || d.used) return true; } catch { return true; }
  return !(r.totalSales > 0);
}

/**
 * Bani chat host for one sales receipt, for the active tenant only: the same read as
 * Scan Receipt, a confirm card, and the same server intake (balance, venue/date, existing
 * day, closure and independent second read) on Record it. The model never records.
 */
export function ChatSalesScan({ handoff, onOpenFull, onRecorded }: { handoff: SalesHandoff; onOpenFull: () => void; onRecorded: (text: string) => void }) {
  const { tenantId } = useActiveTenant();
  const { isAdmin, roleLoading } = useAuth();
  const { isActionHidden, isPreviewActive, loading: permsLoading } = usePagePermissions();
  const { venues, loading: venuesLoading } = useVenues();
  const qc = useQueryClient();
  const names = useMemo(() => venues.filter(v => v.is_active).map(v => v.name), [venues]);
  const allowed = isAdmin && !isActionHidden("data.scan_receipt") && !isPreviewActive;
  const [phase, setPhase] = useState<ChatSalesPhase>("reading");
  const [record, setRecord] = useState<SalesRecord | null>(null);
  /** What was read, to list the person's changes in the confirm. */
  const [read, setRead] = useState<SalesRecord | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState<string>();
  /** Nothing to review: the day is already recorded. */
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || roleLoading || permsLoading || venuesLoading || !tenantId) return;
    started.current = true;
    if (!allowed) { setPhase("denied"); return; }
    void readSalesReceipt(handoff.file, names, tenantId).then(res => {
      if (!res.ok) { setPhase("failed"); return; }
      setRecord(res.record); setRead(res.record); setScanId(res.scanId);
      setPhase(needsFullSalesReview(res.record) ? "review" : "ready");
    });
  }, [roleLoading, permsLoading, venuesLoading, tenantId, allowed, names, handoff.file]);

  const record_ = async () => {
    if (!record || !tenantId || !allowed || saving) return;
    setSaving(true);
    const result = await saveReceiptIntake(record, handoff.file, scanId, tenantId);
    setSaving(false);
    if (result.status === "saved") {
      qc.invalidateQueries({ queryKey: ["sales-records"] });
      onRecorded(`Recorded · ${record.venue} · ${shortDay(record.date)} · ${formatMoney(record.totalSales)}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["receipt-intakes"] });
    const why = result.status === "flagged" ? result.reasons ?? [] : [];
    const day = `${record.venue} · ${shortDay(record.date)}`;
    if (result.status === "flagged" && result.repeated) { setReason("Already received"); setDone(true); }
    else if (why.some(w => w.startsWith("Sales already recorded"))) { setReason(`${day} is already recorded`); setDone(true); }
    else if (why.some(w => w.includes("is marked closed"))) setReason(`${day} is marked closed`);
    else if (result.status === "failed") setReason("It didn't save. Try again");
    setPhase("flagged");
  };

  const changes = useMemo(() => {
    if (!record || !read) return [];
    const fields: SalesFigure[] = ["guests", "subtotal", "serviceCharge", "discount", "visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "deliveroo", "foodpanda", "keeta", "cardTips"];
    return fields.filter(f => Math.abs((record[f] as number) - (read[f] as number)) > 0.004).map(f => ({ field: f, from: read[f] as number, to: record[f] as number }));
  }, [record, read]);
  const onDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let day = ""; try { day = format(parseISO(date), "EEE"); } catch { day = ""; }
    setRecord(r => r && { ...r, date, day });
  };

  return <ChatSalesCard changes={changes} onDate={onDate} onFigure={(f, v) => setRecord(r => r && applySalesFigure(r, f, v))} phase={phase} record={record} venues={names} saving={saving} reason={reason} settled={done}
    onVenue={v => setRecord(r => r && names.includes(v) ? { ...r, venue: v } : r)}
    onRecord={() => void record_()} onOpenFull={onOpenFull} />;
}
