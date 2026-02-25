import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";

interface Props {
  record: SalesRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesDetailModal({ record, open, onOpenChange }: Props) {
  if (!record) return null;

  const paymentTotal = record.visa + record.mastercard + record.amex + record.unionPay + record.alipay + record.wechat + record.cash;
  const paymentMismatch = Math.abs(paymentTotal - record.totalSales) > 0.01;
  const expectedTotal = record.subtotal + record.serviceCharge + record.discount;
  const totalMismatch = Math.abs(record.totalSales - expectedTotal) > 0.01;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">{children}</div>
    </div>
  );

  const Row = ({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) => (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${warn ? "text-destructive" : "text-foreground"}`}>
        {typeof value === "number" ? `$${formatCurrency(value)}` : value}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sales Record — {record.date}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <Section title="General">
            <Row label="Date" value={record.date} />
            <Row label="Day" value={record.day} />
            <Row label="Venue" value={record.venue} />
            <Row label="Report #" value={record.reportNumber || "—"} />
            <Row label="Orders" value={record.orders} />
            <Row label="Guests" value={record.guests} />
          </Section>

          <Section title="Sales Breakdown">
            <Row label="Subtotal" value={record.subtotal} />
            <Row label="Service Charge" value={record.serviceCharge} />
            <Row label="Discount" value={record.discount} />
            <Row label="Total Sales" value={record.totalSales} warn={totalMismatch} />
          </Section>
          {totalMismatch && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
              <span className="text-destructive font-semibold">⚠</span>
              <span>Expected total: <strong>${formatCurrency(expectedTotal)}</strong> (Subtotal + Service Charge + Discount)</span>
            </div>
          )}

          <Section title="Payment Methods">
            <Row label="VISA" value={record.visa} />
            <Row label="Mastercard" value={record.mastercard} />
            <Row label="AMEX" value={record.amex} />
            <Row label="Union Pay" value={record.unionPay} />
            <Row label="Alipay" value={record.alipay} />
            <Row label="WeChat" value={record.wechat} />
            <Row label="Cash" value={record.cash} />
            <Row label="Card Tips" value={record.cardTips} />
          </Section>
          <div className="flex items-center justify-between py-1 px-1 rounded bg-secondary/50">
            <span className="text-sm font-medium text-foreground">Payment Total</span>
            <span className={`text-sm font-bold ${paymentMismatch ? "text-destructive" : "text-foreground"}`}>
              ${formatCurrency(paymentTotal)}
            </span>
          </div>
          {paymentMismatch && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
              <span className="text-destructive font-semibold">⚠</span>
              <span>Payment methods total (<strong>${formatCurrency(paymentTotal)}</strong>) does not match Total Sales (<strong>${formatCurrency(record.totalSales)}</strong>). Difference: <strong>${formatCurrency(Math.abs(paymentTotal - record.totalSales))}</strong></span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
