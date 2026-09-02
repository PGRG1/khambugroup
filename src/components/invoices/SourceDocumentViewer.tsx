import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Maximize2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SourceDocumentViewerProps {
  files: File[];
  activeEvidenceField?: string | null;
}

const formatFieldName = (field?: string | null) => {
  if (!field) return "Document";
  return field.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default function SourceDocumentViewer({ files, activeEvidenceField }: SourceDocumentViewerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [open, setOpen] = useState(true);

  const activeFile = files[pageIndex] ?? null;
  const fileUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, files.length - 1)));
  }, [files.length]);

  useEffect(() => {
    return () => fileUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [fileUrls]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [pageIndex]);

  const isPdf = activeFile?.type === "application/pdf" || activeFile?.name.toLowerCase().endsWith(".pdf");
  const activeUrl = fileUrls[pageIndex];

  const changePage = (next: number) => {
    setPageIndex(Math.max(0, Math.min(files.length - 1, next)));
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <section className="rounded-lg border border-border bg-muted/20 overflow-hidden lg:sticky lg:top-3">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-0 text-xs font-medium hover:bg-transparent">
                <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" />
                <span>{open ? "Source document" : "View source document"}</span>
              </Button>
            </CollapsibleTrigger>
            {activeEvidenceField && (
              <p className="truncate pl-5 text-[10px] text-primary">Reviewing: {formatFieldName(activeEvidenceField)}</p>
            )}
          </div>
          {activeFile && activeUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Open source in new tab"
              aria-label="Open source in new tab"
              onClick={() => window.open(activeUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <CollapsibleContent>
          {!activeFile || !activeUrl ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-5 py-10 text-center text-xs text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p>The source document is temporarily unavailable.</p>
              <p className="text-[11px]">The extracted invoice can still be reviewed below.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2 py-1.5">
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Previous page" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="min-w-[76px] text-center text-[11px] font-mono text-muted-foreground">
                    {pageIndex + 1} / {files.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Next page" aria-label="Next page" disabled={pageIndex === files.length - 1} onClick={() => changePage(pageIndex + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Fit document" aria-label="Fit document" onClick={() => { setZoom(1); setRotation(0); }}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Rotate counterclockwise" aria-label="Rotate counterclockwise" onClick={() => setRotation((value) => value - 90)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Rotate clockwise" aria-label="Rotate clockwise" onClick={() => setRotation((value) => value + 90)}>
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="custom-scroll-hide max-h-[68vh] overflow-auto bg-background/40 p-3">
                {isPdf ? (
                  <iframe src={activeUrl} title={activeFile.name} className="h-[62vh] min-h-[420px] w-full rounded-md border border-border bg-background" />
                ) : (
                  <div className="flex min-h-[260px] justify-center overflow-auto">
                    <img
                      src={activeUrl}
                      alt={`Source invoice page ${pageIndex + 1}`}
                      className="h-auto max-w-full origin-top object-contain transition-transform duration-150"
                      style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, marginBottom: rotation % 180 !== 0 ? "20%" : undefined }}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-1.5 overflow-x-auto border-t border-border/70 p-2">
                {files.map((file, index) => (
                  <Button
                    key={`${file.name}-${index}`}
                    variant={index === pageIndex ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 max-w-[150px] shrink-0 gap-1.5 px-2 text-[10px]"
                    title={file.name}
                    onClick={() => changePage(index)}
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{index + 1}. {file.name}</span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
