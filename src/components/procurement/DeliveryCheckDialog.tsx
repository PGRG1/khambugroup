import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";
import {
  reportDeliveryProblem,
  type DeliveryIssue,
  type DeliveryIssueInput,
  type DeliveryLineInput,
} from "@/utils/deliveryCheck";

export interface DeliveryCheckLine extends DeliveryLineInput {
  description: string;
  unit: string;
}

export interface DeliveryCheckTarget {
  invoiceId: string;
  supplierName: string;
  total: number;
  invoiceDate: string;
  lines: DeliveryCheckLine[];
}

const ISSUE_CHIPS: { value: DeliveryIssue; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
];

/**
 * "Report a problem" pop-up: flag Short / Damaged / Wrong item lines with an
 * affected quantity. Centered, phone-friendly. Opened from the invoice detail
 * panel or a GRN's detail view.
 */
export function DeliveryCheckDialog({
  target,
  tenantId,
  userId,
  onClose,
}: {
  target: DeliveryCheckTarget | null;
  tenantId: string;
  userId: string;
  onClose: () => void;
}) {
  const [issues, setIssues] = useState<Record<string, DeliveryIssueInput>>({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    setIssues({});
    onClose();
  };

  if (!target) return null;

  const saveProblem = async () => {
    if (Object.keys(issues).length === 0) {
      toast.error("Mark at least one line as Short, Damaged or Wrong item.");
      return;
    }
    for (const [lineId, hit] of Object.entries(issues)) {
      const line = target.lines.find((l) => l.invoice_line_item_id === lineId);
      if (hit.affectedQty == null || hit.affectedQty <= 0 || (line && hit.affectedQty > line.quantity_received)) {
        toast.error("For each flagged line, enter how many are affected (up to the received quantity).");
        return;
      }
    }
    setBusy(true);
    const res = await reportDeliveryProblem(
      target.invoiceId,
      target.lines,
      issues,
      { tenantId, userId, invoiceDate: target.invoiceDate },
    );
    setBusy(false);
    if (res.error) {
      toast.error(`Could not save the problem — ${res.error}`);
      return;
    }
    toast.success(`Delivery flagged as disputed${res.grnNumber ? ` · GRN ${res.grnNumber}` : ""}.`);
    close();
  };

  const toggleIssue = (lineId: string, issue: DeliveryIssue) => {
    setIssues((prev) => {
      const next = { ...prev };
      if (next[lineId]?.issue === issue) delete next[lineId];
      else next[lineId] = { issue };
      return next;
    });
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !busy) close(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[85vh] overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Report a problem · {target.supplierName}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">
          <span className="td-num font-semibold text-foreground">{formatCurrency(target.total)}</span>
          {" · "}
          {target.lines.length} {target.lines.length === 1 ? "line" : "lines"}
        </div>

        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">Tap what went wrong on each line and enter how many are affected. Everything else stays as received.</div>
          <div className="space-y-2">
            {target.lines.map((line) => {
              const hit = issues[line.invoice_line_item_id];
              return (
                <div key={line.invoice_line_item_id} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium truncate">{line.description}</div>
                    <div className="text-xs text-muted-foreground shrink-0 td-num">
                      received {line.quantity_received} {line.unit}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ISSUE_CHIPS.map((chip) => (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => toggleIssue(line.invoice_line_item_id, chip.value)}
                        className={cn(
                          "rounded-full border px-3 h-8 text-xs font-medium transition-colors",
                          hit?.issue === chip.value
                            ? "border-warning/60 bg-warning/15 text-warning"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  {hit && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Affected:</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={line.quantity_received}
                        className="h-9 w-24 td-num"
                        value={hit.affectedQty ?? ""}
                        onChange={(e) =>
                          setIssues((prev) => ({
                            ...prev,
                            [line.invoice_line_item_id]: {
                              issue: hit.issue,
                              affectedQty: e.target.value === "" ? undefined : Number(e.target.value),
                            },
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">of {line.quantity_received} {line.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
            <Button className="flex-1 h-11" onClick={saveProblem} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save problem
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
