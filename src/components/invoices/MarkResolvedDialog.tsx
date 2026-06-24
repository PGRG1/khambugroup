import React, { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ResolutionValue = "credit_note" | "qty_received" | "resolved";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber?: string;
  busy?: boolean;
  onConfirm: (resolution: ResolutionValue, note: string) => void;
}

const OPTIONS: Array<{ value: ResolutionValue; label: string }> = [
  { value: "credit_note", label: "Credit note received" },
  { value: "qty_received", label: "Qty received from supplier" },
  { value: "resolved", label: "Other" },
];

export const MarkResolvedDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  invoiceNumber,
  busy,
  onConfirm,
}) => {
  const [resolution, setResolution] = useState<ResolutionValue | "">("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setResolution("");
      setNote("");
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Mark invoice resolved
            {invoiceNumber ? ` — ${invoiceNumber}` : ""}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="resolution-type" className="text-xs">
              Resolution type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={resolution}
              onValueChange={(v) => setResolution(v as ResolutionValue)}
            >
              <SelectTrigger id="resolution-type" className="h-9">
                <SelectValue placeholder="Select resolution…" />
              </SelectTrigger>
              <SelectContent>
                {OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resolution-note" className="text-xs">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="resolution-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Credit note CN-0041 received from Jebsen"
              rows={3}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !resolution}
            className="bg-amber-500 text-amber-950 hover:bg-amber-500/90"
            onClick={(e) => {
              e.preventDefault();
              if (!resolution) return;
              onConfirm(resolution, note.trim());
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MarkResolvedDialog;
