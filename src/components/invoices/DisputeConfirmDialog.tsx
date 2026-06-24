import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DisputedLineSummary {
  description: string;
  invPrice: number;
  accPrice: number;
  invQty: number;
  accQty: number;
  unit?: string | null;
  /** (unit_price * quantity) - (accepted_price * accepted_qty). Positive = over-billed. */
  variance: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: DisputedLineSummary[];
  disputedAmount: number;
  onConfirm: () => void;
  busy?: boolean;
}

function fmtAmount(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVariance(variance: number) {
  // Positive variance = supplier over-billed → show as negative impact (–$X.XX)
  if (Math.abs(variance) < 0.005) return "$0.00";
  const sign = variance > 0 ? "–" : "+";
  return `${sign}$${fmtAmount(Math.abs(variance))}`;
}

export const DisputeConfirmDialog: React.FC<Props> = ({
  open, onOpenChange, lines, disputedAmount, onConfirm, busy,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm with disputes?</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Item</th>
                <th className="p-2 text-right">Inv. price</th>
                <th className="p-2 text-right">Acc. price</th>
                <th className="p-2 text-right">Inv. qty</th>
                <th className="p-2 text-right">Acc. qty</th>
                <th className="p-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2 max-w-[220px] truncate" title={l.description}>{l.description}</td>
                  <td className="p-2 text-right tabular-nums">${fmtAmount(l.invPrice)}</td>
                  <td className={`p-2 text-right tabular-nums ${Math.abs(l.accPrice - l.invPrice) > 0.0001 ? "text-amber-400" : ""}`}>${fmtAmount(l.accPrice)}</td>
                  <td className="p-2 text-right tabular-nums">{l.invQty}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td className={`p-2 text-right tabular-nums ${l.accQty !== l.invQty ? "text-amber-400" : ""}`}>{l.accQty}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td className={`p-2 text-right tabular-nums font-medium ${l.variance > 0 ? "text-red-400" : l.variance < 0 ? "text-emerald-400" : ""}`}>{fmtVariance(l.variance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr>
                <td colSpan={5} className="p-2 text-right font-medium">Total disputed amount</td>
                <td className={`p-2 text-right tabular-nums font-semibold ${disputedAmount > 0 ? "text-red-400" : disputedAmount < 0 ? "text-emerald-400" : ""}`}>
                  {fmtVariance(disputedAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Cost and inventory will be posted using accepted quantities and prices. The disputed amount will be tracked for follow-up with the supplier.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            Confirm anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DisputeConfirmDialog;
