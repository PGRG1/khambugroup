import React, { useState, useEffect } from "react";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
}

export const VoidInvoiceDialog: React.FC<Props> = ({
  open, onOpenChange, invoiceNumber, busy, onConfirm,
}) => {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-reason" className="text-xs">
            Reason for voiding <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Supplier sending corrected invoice"
            rows={3}
          />
          <p className="text-xs text-red-400/80">
            This cannot be undone. No GRN will be created for {invoiceNumber ? `invoice ${invoiceNumber}` : "this invoice"}.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || reason.trim().length === 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); onConfirm(reason.trim()); }}
          >
            Void invoice
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default VoidInvoiceDialog;
