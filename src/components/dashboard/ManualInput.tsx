import { useState, useMemo, useEffect } from "react";
import { X, Plus, Paperclip } from "lucide-react";
import { SalesRecord } from "@/types/sales";
import { getPaymentTotal } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";

interface ManualInputProps {
  onAdd: (record: SalesRecord, file?: File | null) => void;
  onClose: () => void;
}

const emptyRecord: SalesRecord = {
  date: "", day: "", venue: "", reportNumber: "",
  orders: 0, guests: 0, subtotal: 0, serviceCharge: 0, discount: 0,
  totalSales: 0, visa: 0, mastercard: 0, amex: 0, unionPay: 0,
  jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, cardTips: 0,
  servicePeriodId: null,
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ManualInput = ({ onAdd, onClose }: ManualInputProps) => {
  const [form, setForm] = useState<SalesRecord>(emptyRecord);
  const [file, setFile] = useState<File | null>(null);

  const { venues } = useVenues();
  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);

  // Default to first active venue once loaded (avoids blank submit).
  useEffect(() => {
    if (!form.venue && activeVenues[0]) {
      setForm((f) => ({ ...f, venue: activeVenues[0].name }));
    }
  }, [activeVenues, form.venue]);

  const venueId = useMemo(
    () => venues.find((v) => v.name === form.venue)?.id ?? null,
    [venues, form.venue],
  );
  const venueIdList = useMemo(() => (venueId ? [venueId] : []), [venueId]);
  const { operational: periods } = useVenueServicePeriods(venueIdList);

  const set = (key: keyof SalesRecord, value: string | number | null) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Clear servicePeriodId when venue changes so it doesn't leak across venues.
  useEffect(() => {
    setForm((f) => ({ ...f, servicePeriodId: null }));
  }, [form.venue]);

  // Auto-tag the single-period case (submit-time behavior handled below too,
  // but reflecting it in state keeps the UI honest).
  useEffect(() => {
    if (periods.length === 1) {
      setForm((f) => (f.servicePeriodId === periods[0].id ? f : { ...f, servicePeriodId: periods[0].id }));
    }
  }, [periods]);

  const handleDateChange = (date: string) => {
    const d = new Date(date);
    const dayName = days[(d.getDay() + 6) % 7];
    set("date", date);
    set("day", dayName);
  };

  const normalizedDiscount = -Math.abs(form.discount);
  const normalizedCardTips = -Math.abs(form.cardTips);
  const expectedTotal = form.subtotal + form.serviceCharge + normalizedDiscount;
  const totalMismatch = form.totalSales !== 0 && Math.abs(form.totalSales - expectedTotal) > 0.01;

  const paymentTotal = getPaymentTotal({ ...form, cardTips: normalizedCardTips });
  const paymentMismatch = form.totalSales !== 0 && paymentTotal !== 0 && Math.abs(paymentTotal - form.totalSales) > 0.01;

  const periodRequired = periods.length >= 2;
  const periodMissing = periodRequired && !form.servicePeriodId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.venue) return;
    if (periodMissing) return;
    // Resolve auto-tag at submit as a safety net (state already reflects it for 1-period).
    let servicePeriodId = form.servicePeriodId ?? null;
    if (!servicePeriodId && periods.length === 1) servicePeriodId = periods[0].id;
    onAdd(
      { ...form, discount: normalizedDiscount, cardTips: normalizedCardTips, servicePeriodId },
      file,
    );
    setForm(emptyRecord);
    setFile(null);
  };

  const numField = (label: string, key: keyof SalesRecord) => (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        value={form[key] as number || ""}
        onChange={(e) => set(key, parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );

  const autoTaggedPeriodName = periods.length === 1 ? periods[0].name : null;

  return (
    <div className="card-glass rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          Manual Entry
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Venue</label>
            <select
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
              required
              className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {activeVenues.length === 0 && <option value="">No venues configured</option>}
              {activeVenues.map((v) => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Report #</label>
            <input
              type="text"
              value={form.reportNumber}
              onChange={(e) => set("reportNumber", e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {numField("Orders", "orders")}
        </div>

        {/* Service period tagging */}
        {periods.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground">Service Period</label>
            {autoTaggedPeriodName ? (
              <div className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary/40 text-muted-foreground">
                <span className="text-foreground font-medium">{autoTaggedPeriodName}</span>
                <span className="ml-2 text-[11px] italic">(auto-tagged)</span>
              </div>
            ) : (
              <select
                value={form.servicePeriodId ?? ""}
                onChange={(e) => set("servicePeriodId", e.target.value || null)}
                required
                className={`w-full px-3 py-1.5 text-sm rounded-md border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                  periodMissing ? "border-destructive" : "border-border"
                }`}
              >
                <option value="" disabled>Select a period…</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {numField("Guests", "guests")}
          {numField("Subtotal", "subtotal")}
          {numField("Service Charge", "serviceCharge")}
          {numField("Discount (enter as positive)", "discount")}
          {numField("Total Sales", "totalSales")}
        </div>
        {totalMismatch && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <span className="text-destructive font-semibold shrink-0">⚠</span>
            <span className="text-foreground">
              <span className="font-medium text-destructive">Total mismatch:</span>{" "}
              Subtotal ({form.subtotal}) + Service Charge ({form.serviceCharge}) − Discount ({Math.abs(form.discount)}) = <strong>{expectedTotal}</strong>, but Total Sales is <strong>{form.totalSales}</strong>
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {numField("VISA", "visa")}
          {numField("Mastercard", "mastercard")}
          {numField("AMEX", "amex")}
          {numField("Union Pay", "unionPay")}
          {numField("JCB", "jcb")}
          {numField("Alipay", "alipay")}
          {numField("WeChat", "wechat")}
          {numField("PayMe", "payme")}
          {numField("Cash", "cash")}
          {numField("Card Tips (enter as positive)", "cardTips")}
        </div>
        {paymentMismatch && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <span className="text-destructive font-semibold shrink-0">⚠</span>
            <span className="text-foreground">
              <span className="font-medium text-destructive">Payment mismatch:</span>{" "}
              Payment methods total − card tips (<strong>{paymentTotal.toLocaleString()}</strong>) does not match Total Sales (<strong>{form.totalSales.toLocaleString()}</strong>). Difference: <strong>{Math.abs(paymentTotal - form.totalSales).toLocaleString()}</strong>
            </span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-border">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <Paperclip className="h-4 w-4" />
            <span>{file ? "Change receipt" : "Attach receipt (optional)"}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {file && (
            <div className="flex items-center gap-2 text-xs text-foreground">
              <span className="truncate max-w-[200px]">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={periodMissing}
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {periodMissing ? "Select a service period" : "Add Record"}
        </button>
      </form>
    </div>
  );
};

export default ManualInput;
