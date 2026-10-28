import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";
import {
  confirmDeliveryGrn,
  disputeDeliveryGrn,
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
  lines: DeliveryCheckLine[];
}

const ISSUE_CHIPS: { value: DeliveryIssue; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
];

/**
 * Quick-mode door tap: after an invoice is scanned and saved, confirm the
 * delivery in one tap or flag problem lines. Centered, phone-friendly.
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
  const [step, setStep] = useState<"choice" | "problem">("choice");
  const [issues, setIssues] = useState<Record<string, DeliveryIssueInput>>({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    setStep("choice");
    setIssues({});
    onClose();
  };

  if (!target) return null;

  const allGood = async () => {
    setBusy(true);
    const res = await confirmDeliveryGrn(target.invoiceId, { tenantId, userId });
    setBusy(false);
    if (res.error) {
      toast.error(`Could not confirm the delivery — ${res.error}`);
      return;
    }
    toast.success(`Delivery confirmed${res.grnNumber ? ` · GRN ${res.grnNumber}` : ""}.`);
    close();
  };

  const saveProblem = async () => {
    if (Object.keys(issues).length === 0) {
      toast.error("Mark at least one line as Short, Damaged or Wrong item.");
      return;
    }
    for (const [lineId, hit] of Object.entries(issues)) {
      if (hit.issue === "short") {
        const line = target.lines.find((l) => l.invoice_line_item_id === lineId);
        if (hit.receivedQty == null || hit.receivedQty < 0 || (line && hit.receivedQty > line.quantity_invoiced)) {
          toast.error("For Short lines, enter how many actually arrived (0 up to the invoiced quantity).");
          return;
        }
      }
    }
    setBusy(true);
    const res = await disputeDeliveryGrn(
      target.invoiceId,
      target.lines,
      issues,
      { tenantId, userId },
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
          <DialogTitle className="text-base">New delivery · {target.supplierName}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">
          <span className="td-num font-semibold text-foreground">{formatCurrency(target.total)}</span>
          {" · "}
          {target.lines.length} {target.lines.length === 1 ? "line" : "lines"}
        </div>

        {step === "choice" ? (
          <div className="mt-4 grid gap-2">
            <Button size="lg" className="h-12 text-base" onClick={allGood} disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <PackageCheck className="h-5 w-5 mr-2" />}
              All good
            </Button>
            <Button size="lg" variant="outline" className="h-12 text-base" onClick={() => setStep("problem")} disabled={busy}>
              <AlertTriangle className="h-5 w-5 mr-2" />
              Problem with this delivery
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-muted-foreground">Tap what went wrong on each line. Everything else counts as received in full.</div>
            <div className="space-y-2">
              {target.lines.map((line) => {
                const hit = issues[line.invoice_line_item_id];
                return (
                  <div key={line.invoice_line_item_id} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium truncate">{line.description}</div>
                      <div className="text-xs text-muted-foreground shrink-0 td-num">
                        {line.quantity_invoiced} {line.unit}
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
                    {hit?.issue === "short" && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Arrived:</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={line.quantity_invoiced}
                          className="h-9 w-24 td-num"
                          value={hit.receivedQty ?? ""}
                          onChange={(e) =>
                            setIssues((prev) => ({
                              ...prev,
                              [line.invoice_line_item_id]: {
                                issue: "short",
                                receivedQty: e.target.value === "" ? undefined : Number(e.target.value),
                              },
                            }))
                          }
                        />
                        <span className="text-xs text-muted-foreground">of {line.quantity_invoiced} {line.unit}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" onClick={() => setStep("choice")} disabled={busy}>Back</Button>
              <Button className="flex-1 h-11" onClick={saveProblem} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save problem
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
