import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useVenues } from "@/hooks/useVenues";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getPaymentTotal } from "@/utils/salesUtils";
import { ArrowLeft, Pencil, Trash2, Eye, Paperclip, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";


const SalesRecordDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecordById, updateRecord, deleteRecord, attachReceipt } = useSalesData();
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();

  const [record, setRecord] = useState<SalesRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SalesRecord | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { venues } = useVenues();
  const activeVenueName = (editing && draft ? draft : record)?.venue ?? "";
  const venueId = useMemo(
    () => venues.find((v) => v.name === activeVenueName)?.id ?? null,
    [venues, activeVenueName],
  );
  const venueIdList = useMemo(() => (venueId ? [venueId] : []), [venueId]);
  const { operational: periods } = useVenueServicePeriods(venueIdList);

  const canEdit = isAdmin && !isActionHidden("data.edit_rows");
  const canDelete = isAdmin && !isActionHidden("data.delete_rows");


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) { setLoading(false); return; }
      const r = await getRecordById(id);
      if (!cancelled) { setRecord(r); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, getRecordById]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading record…</p></div>;
  }

  if (!record) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <h2 className="text-lg font-semibold">Record not found</h2>
        <p className="text-sm text-muted-foreground">This sales record no longer exists, or you don't have access to it.</p>
        <Button variant="outline" onClick={() => navigate("/sales-data")}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Sales Data</Button>
      </div>
    );
  }

  const active = editing && draft ? draft : record;
  const paymentTotal = getPaymentTotal(active);
  const paymentMismatch = Math.abs(paymentTotal - active.totalSales) > 0.01;
  const expectedTotal = active.subtotal + active.serviceCharge + active.discount;
  const totalMismatch = Math.abs(active.totalSales - expectedTotal) > 0.01;

  const startEdit = () => { setDraft({ ...record }); setEditing(true); };
  const cancelEdit = () => { setDraft(null); setEditing(false); };
  const setField = (k: keyof SalesRecord, v: string | number) => {
    if (!draft) return;
    setDraft({ ...draft, [k]: v });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const ok = await updateRecord(record, draft);
    setSaving(false);
    if (ok) {
      toast.success("Record updated");
      setRecord(draft);
      setEditing(false);
      setDraft(null);
    } else {
      toast.error("Update failed");
    }
  };

  const doDelete = async () => {
    const ok = await deleteRecord(record);
    setShowDelete(false);
    if (ok) {
      toast.success("Record deleted");
      navigate("/sales-data");
    } else {
      toast.error("Delete failed");
    }
  };

  const doAttachReceipt = async (file: File) => {
    const ok = await attachReceipt(record, file);
    if (ok && id) {
      const fresh = await getRecordById(id);
      if (fresh) setRecord(fresh);
      toast.success("Receipt attached");
    } else if (!ok) {
      toast.error("Upload failed");
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">{children}</div>
    </div>
  );

  const Row = ({ label, value, warn, fieldKey, isCurrency = true }: {
    label: string; value: string | number; warn?: boolean; fieldKey?: keyof SalesRecord; isCurrency?: boolean;
  }) => {
    if (editing && draft && fieldKey) {
      const isNumeric = typeof record[fieldKey] === "number";
      return (
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          {isNumeric ? (
            <input
              type="number"
              value={draft[fieldKey] as number}
              onChange={(e) => setField(fieldKey, parseFloat(e.target.value) || 0)}
              className="w-32 px-2 py-1 text-sm text-right rounded border border-border bg-background text-foreground"
            />
          ) : (
            <input
              type="text"
              value={draft[fieldKey] as string}
              onChange={(e) => setField(fieldKey, e.target.value)}
              className="w-32 px-2 py-1 text-sm text-right rounded border border-border bg-background text-foreground"
            />
          )}
        </div>
      );
    }
    const isZero = typeof value === "number" && value === 0;
    const isNegDiscount = fieldKey === "discount" && typeof value === "number" && value < 0;
    const cls = warn
      ? "text-destructive font-semibold"
      : isNegDiscount
        ? "text-destructive"
        : isZero
          ? "text-muted-foreground"
          : "text-foreground";
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-sm font-medium ${cls}`}>
          {typeof value === "number" ? (isCurrency ? `$${formatCurrency(value)}` : value.toLocaleString()) : value}
        </span>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/sales-data")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight">
              <span className="text-gradient-gold">Sales Record</span>
            </h1>
            <p className="text-xs text-muted-foreground">{record.venue} · {record.date} · Report #{record.reportNumber || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {record.receiptFileUrl && !editing && (
            <Button variant="ghost" size="sm" onClick={() => setShowReceipt(true)} title="View receipt">
              <Eye className="h-4 w-4" />
            </Button>
          )}
          {canEdit && !editing && (
            <>
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title={record.receiptFileUrl ? "Replace receipt" : "Attach receipt"}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doAttachReceipt(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
            </>
          )}
          {canDelete && !editing && (
            <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={cancelEdit}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}</Button>
            </>
          )}
        </div>
      </div>

      <Card className="card-glass p-5 space-y-6">
        <Section title="General">
          <Row label="Date" value={active.date} fieldKey="date" />
          <Row label="Day" value={active.day} fieldKey="day" />
          <Row label="Venue" value={active.venue} fieldKey="venue" />
          {/* Service period: edit = selector; read = resolved name / "Not tagged". */}
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-muted-foreground">Service Period</span>
            {editing && draft ? (
              <select
                value={draft.servicePeriodId ?? ""}
                onChange={(e) => setField("servicePeriodId" as keyof SalesRecord, e.target.value || (null as any))}
                className="w-40 px-2 py-1 text-sm rounded border border-border bg-background text-foreground"
              >
                <option value="">Not tagged</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <span className={`text-sm font-medium ${active.servicePeriodId ? "text-foreground" : "text-muted-foreground italic"}`}>
                {active.servicePeriodId
                  ? (periods.find((p) => p.id === active.servicePeriodId)?.name ?? "Unknown period")
                  : "Not tagged"}
              </span>
            )}
          </div>
          <Row label="Report #" value={active.reportNumber || "—"} fieldKey="reportNumber" />
          <Row label="Orders" value={active.orders} fieldKey="orders" isCurrency={false} />
          <Row label="Guests" value={active.guests} fieldKey="guests" isCurrency={false} />
        </Section>


        <Section title="Sales Breakdown">
          <Row label="Subtotal" value={active.subtotal} fieldKey="subtotal" />
          <Row label="Service Charge" value={active.serviceCharge} fieldKey="serviceCharge" />
          <Row label="Discount" value={active.discount} fieldKey="discount" />
          <Row label="Total Sales" value={active.totalSales} warn={totalMismatch} fieldKey="totalSales" />
        </Section>
        {totalMismatch && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
            <span className="text-destructive font-semibold">⚠</span>
            <span>Expected total: <strong>${formatCurrency(expectedTotal)}</strong> (Subtotal + Service Charge + Discount)</span>
          </div>
        )}

        <Section title="Payment Methods">
          <Row label="VISA" value={active.visa} fieldKey="visa" />
          <Row label="Mastercard" value={active.mastercard} fieldKey="mastercard" />
          <Row label="AMEX" value={active.amex} fieldKey="amex" />
          <Row label="Union Pay" value={active.unionPay} fieldKey="unionPay" />
          <Row label="JCB" value={active.jcb} fieldKey="jcb" />
          <Row label="Alipay" value={active.alipay} fieldKey="alipay" />
          <Row label="WeChat" value={active.wechat} fieldKey="wechat" />
          <Row label="PayMe" value={active.payme} fieldKey="payme" />
          <Row label="Cash" value={active.cash} fieldKey="cash" />
          <Row label="Card Tips" value={active.cardTips} fieldKey="cardTips" />
        </Section>

        <div className="flex items-center justify-between py-2 px-3 rounded bg-secondary/50">
          <span className="text-sm font-medium text-foreground">Payment Total</span>
          <span className={`text-sm font-bold ${paymentMismatch ? "text-destructive" : "text-foreground"}`}>
            ${formatCurrency(paymentTotal)}
          </span>
        </div>
        {paymentMismatch && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
            <span className="text-destructive font-semibold">⚠</span>
            <span>
              Payment methods total (<strong>${formatCurrency(paymentTotal)}</strong>) does not match Total Sales
              (<strong>${formatCurrency(active.totalSales)}</strong>). Difference: <strong>${formatCurrency(Math.abs(paymentTotal - active.totalSales))}</strong>
            </span>
          </div>
        )}
      </Card>

      <DeleteConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={doDelete}
        title="Delete Sales Record"
        description="Are you sure you want to delete this sales record? This action cannot be undone."
      />

      {record.receiptFileUrl && (
        <AttachmentViewerDialog
          open={showReceipt}
          onOpenChange={setShowReceipt}
          fileUrl={record.receiptFileUrl}
          title={`Receipt — ${record.venue} ${record.date}`}
          bucket="sales-receipts"
        />
      )}
    </div>
  );
};

export default SalesRecordDetail;
