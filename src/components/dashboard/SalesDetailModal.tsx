import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getPaymentTotal } from "@/utils/salesUtils";
import { Pencil, Trash2 } from "lucide-react";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface Props {
  record: SalesRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (record: SalesRecord) => void;
  onDelete?: (record: SalesRecord) => void;
}

export function SalesDetailModal({ record, open, onOpenChange, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<SalesRecord | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!record) return null;

  const active = editing && editData ? editData : record;

  const paymentTotal = getPaymentTotal(active);
  const paymentMismatch = Math.abs(paymentTotal - active.totalSales) > 0.01;
  const expectedTotal = active.subtotal + active.serviceCharge + active.discount;
  const totalMismatch = Math.abs(active.totalSales - expectedTotal) > 0.01;

  const startEdit = () => {
    setEditData({ ...record });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditData(null);
  };

  const saveEdit = () => {
    if (editData && onEdit) {
      onEdit(editData);
    }
    setEditing(false);
    setEditData(null);
  };

  const setField = (key: keyof SalesRecord, value: string | number) => {
    if (!editData) return;
    setEditData({ ...editData, [key]: value });
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      cancelEdit();
    }
    onOpenChange(o);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">{children}</div>
    </div>
  );

  const Row = ({ label, value, warn, fieldKey, isCurrency = true }: { label: string; value: string | number; warn?: boolean; fieldKey?: keyof SalesRecord; isCurrency?: boolean }) => {
    if (editing && editData && fieldKey) {
      const isNumeric = typeof record[fieldKey] === "number";
      return (
        <div className="flex items-center justify-between py-0.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          {isNumeric ? (
            <input
              type="number"
              value={editData[fieldKey] as number}
              onChange={(e) => setField(fieldKey, parseFloat(e.target.value) || 0)}
              className="w-24 px-2 py-0.5 text-sm text-right rounded border border-border bg-background text-foreground"
            />
          ) : (
            <input
              type="text"
              value={editData[fieldKey] as string}
              onChange={(e) => setField(fieldKey, e.target.value)}
              className="w-24 px-2 py-0.5 text-sm text-right rounded border border-border bg-background text-foreground"
            />
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between py-0.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-sm font-medium ${warn ? "text-destructive" : "text-foreground"}`}>
          {typeof value === "number" ? (isCurrency ? `$${formatCurrency(value)}` : value.toLocaleString()) : value}
        </span>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Sales Record — {record.date}</DialogTitle>
              <div className="flex items-center gap-1">
                {onEdit && !editing && (
                  <button onClick={startEdit} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {onDelete && !editing && (
                  <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <Section title="General">
              <Row label="Date" value={active.date} fieldKey="date" />
              <Row label="Day" value={active.day} fieldKey="day" />
              <Row label="Venue" value={active.venue} fieldKey="venue" />
              <Row label="Report #" value={active.reportNumber || "—"} fieldKey="reportNumber" />
              <Row label="Orders" value={active.orders} fieldKey="orders" />
              <Row label="Guests" value={active.guests} fieldKey="guests" />
            </Section>

            <Section title="Sales Breakdown">
              <Row label="Subtotal" value={active.subtotal} fieldKey="subtotal" />
              <Row label="Service Charge" value={active.serviceCharge} fieldKey="serviceCharge" />
              <Row label="Discount" value={active.discount} fieldKey="discount" />
              <Row label="Total Sales" value={active.totalSales} warn={totalMismatch} fieldKey="totalSales" />
            </Section>
            {totalMismatch && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
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
            <div className="flex items-center justify-between py-1 px-1 rounded bg-secondary/50">
              <span className="text-sm font-medium text-foreground">Payment Total</span>
              <span className={`text-sm font-bold ${paymentMismatch ? "text-destructive" : "text-foreground"}`}>
                ${formatCurrency(paymentTotal)}
              </span>
            </div>
            {paymentMismatch && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
                <span className="text-destructive font-semibold">⚠</span>
                <span>Payment methods total (<strong>${formatCurrency(paymentTotal)}</strong>) does not match Total Sales (<strong>${formatCurrency(active.totalSales)}</strong>). Difference: <strong>${formatCurrency(Math.abs(paymentTotal - active.totalSales))}</strong></span>
              </div>
            )}

            {editing && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button onClick={cancelEdit} className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={saveEdit} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          if (onDelete) onDelete(record);
          setShowDeleteConfirm(false);
          onOpenChange(false);
        }}
        title="Delete Sales Record"
        description="Are you sure you want to delete this sales record? This action cannot be undone."
      />
    </>
  );
}
