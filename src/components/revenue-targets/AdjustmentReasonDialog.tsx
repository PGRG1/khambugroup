import React, { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AdjustmentReasonKind =
  | "not_operating"
  | "reactivate"
  | "closed"
  | "events_only"
  | "replaced_by_event"
  | "variance_threshold";

const HEADINGS: Record<AdjustmentReasonKind, string> = {
  not_operating: "Reason: Not Operating",
  reactivate: "Reason: Reactivate Period",
  closed: "Reason: Day marked Closed",
  events_only: "Reason: Day marked Events Only",
  replaced_by_event: "Reason: Period replaced by Event",
  variance_threshold: "Reason: Adjustment exceeds ±15% of Statistical",
};

const HINTS: Record<AdjustmentReasonKind, string> = {
  not_operating: "Explain why this service period will not operate on this date.",
  reactivate: "Note why this period is being reactivated.",
  closed: "Explain the reason the venue is closed on this date.",
  events_only: "Describe why only events will run and normal service is suspended.",
  replaced_by_event: "Describe the event replacing this period, and any operational impact.",
  variance_threshold:
    "Manager Revenue differs from the reliable Statistical benchmark by more than 15%. Please justify.",
};

export interface AdjustmentReasonDialogProps {
  open: boolean;
  kind: AdjustmentReasonKind;
  initialReason?: string | null;
  required?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function AdjustmentReasonDialog({
  open, kind, initialReason, required = true, onCancel, onConfirm,
}: AdjustmentReasonDialogProps) {
  const [reason, setReason] = useState<string>(initialReason ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(initialReason ?? ""); setBusy(false); } }, [open, initialReason]);

  const canSubmit = !required || reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{HEADINGS[kind]}</DialogTitle>
          <DialogDescription>{HINTS[kind]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Type an explanation…"
            rows={4}
            autoFocus
          />
          {required && reason.trim().length > 0 && reason.trim().length < 3 && (
            <p className="text-[11px] text-rose-500">Reason must be at least 3 characters.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={async () => {
              if (!canSubmit) return;
              setBusy(true);
              try { await onConfirm(reason.trim()); }
              finally { setBusy(false); }
            }}
            disabled={!canSubmit || busy}
          >
            {busy ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
