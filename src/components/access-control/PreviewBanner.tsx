import { usePreviewMode } from "@/hooks/usePreviewMode";
import { X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PreviewBanner() {
  const { isPreviewActive, previewUserEmail, exitPreview } = usePreviewMode();

  if (!isPreviewActive) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-3 text-sm shadow-lg">
      <Eye className="h-4 w-4" />
      <span>Previewing as <strong>{previewUserEmail}</strong></span>
      <Button
        size="sm"
        variant="secondary"
        onClick={exitPreview}
        className="h-7 gap-1 text-xs"
      >
        <X className="h-3 w-3" /> Exit Preview
      </Button>
    </div>
  );
}
