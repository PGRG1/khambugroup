import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper around Dialog that anchors to the bottom on mobile as a sheet,
 * and behaves like a centered modal on ≥sm screens.
 */
export function BottomSheetDialog({ open, onOpenChange, children, className }: Props) {
  const isMobile = useIsMobile();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          isMobile
            ? "sm:max-w-md max-w-full w-full left-0 right-0 top-auto bottom-0 translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none border-b-0 data-[state=open]:slide-in-from-bottom-1/2 data-[state=closed]:slide-out-to-bottom-1/2"
            : "sm:max-w-md",
          className,
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
