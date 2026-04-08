import { useState } from "react";
import { X, Plus } from "lucide-react";
import { SalesRecord } from "@/types/sales";
import { getPaymentTotal } from "@/utils/salesUtils";

interface ManualInputProps {
  onAdd: (record: SalesRecord) => void;
  onClose: () => void;
}

const emptyRecord = {
  date: "", day: "", venue: "Assembly" as const, reportNumber: "",
  orders: 0, guests: 0, subtotal: 0, serviceCharge: 0, discount: 0,
  totalSales: 0, visa: 0, mastercard: 0, amex: 0, unionPay: 0,
  jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, cardTips: 0,
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ManualInput = ({ onAdd, onClose }: ManualInputProps) => {
  const [form, setForm] = useState<SalesRecord>(emptyRecord);

  const set = (key: keyof SalesRecord, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleDateChange = (date: string) => {
    const d = new Date(date);
    const dayName = days[(d.getDay() + 6) % 7]; // Monday=0
    set("date", date);
    set("day", dayName);
  };

  // Auto-calculate expected total
  const normalizedDiscount = -Math.abs(form.discount);
  const expectedTotal = form.subtotal + form.serviceCharge + normalizedDiscount;
  const totalMismatch = form.totalSales !== 0 && Math.abs(form.totalSales - expectedTotal) > 0.01;

  // Payment method validation
  const paymentTotal = getPaymentTotal(form);
  const paymentMismatch = form.totalSales !== 0 && paymentTotal !== 0 && Math.abs(paymentTotal - form.totalSales) > 0.01;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.venue) return;
    // Normalize discount to negative before saving
    onAdd({ ...form, discount: normalizedDiscount });
    setForm(emptyRecord);
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
              className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="Assembly">Assembly</option>
              <option value="Caliente">Caliente</option>
              <option value="Hanabi">Hanabi</option>
              <option value="Events">Events</option>
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
          {numField("Card Tips", "cardTips")}
        </div>
        {paymentMismatch && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <span className="text-destructive font-semibold shrink-0">⚠</span>
            <span className="text-foreground">
              <span className="font-medium text-destructive">Payment mismatch:</span>{" "}
              Payment methods total (<strong>{paymentTotal.toLocaleString()}</strong>) does not match Total Sales (<strong>{form.totalSales.toLocaleString()}</strong>). Difference: <strong>{Math.abs(paymentTotal - form.totalSales).toLocaleString()}</strong>
            </span>
          </div>
        )}
        <button
          type="submit"
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Add Record
        </button>
      </form>
    </div>
  );
};

export default ManualInput;
