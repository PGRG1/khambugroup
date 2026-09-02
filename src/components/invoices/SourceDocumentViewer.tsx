import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Maximize2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getEvidenceLabel, resolveEvidenceBox, type InvoiceEvidenceMap } from "@/utils/invoiceEvidence";

interface SourceDocumentViewerProps {
  files: File[];
  activeEvidenceField?: string | null;
  evidence?: InvoiceEvidenceMap | null;
}

export default function SourceDocumentViewer({ files, activeEvidenceField, evidence }: SourceDocumentViewerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const activeFile = files[pageIndex] ?? null;
  const fileUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  const activeBox = resolveEvidenceBox(evidence, activeEvidenceField);
  const hasEvidence = Boolean(evidence && (Object.keys(evidence.header).length > 0 || evidence.lines.some((line) => Object.keys(line).length > 0)));
  const isPdf = activeFile?.type === "application/pdf" || activeFile?.name.toLowerCase().endsWith(".pdf");
  const activeUrl = fileUrls[pageIndex];

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, files.length - 1)));
  }, [files.length]);

  useEffect(() => {
    return () => fileUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [fileUrls]);

  useEffect(() => {
    if (activeBox && activeBox.page !== pageIndex + 1) {
      setPageIndex(Math.max(0, Math.min(files.length - 1, activeBox.page - 1)));
    }
  }, [activeBox, files.length, pageIndex]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [pageIndex]);

  useEffect(() => {
    if (!activeBox || activeBox.page !== pageIndex + 1 || !overlayRef.current || !scrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      overlayRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeBox, pageIndex, open]);

  const changePage = (next: number) => {
    setPageIndex(Math.max(0, Math.min(files.length - 1, next)));
  };

  const showLegacyFallback = Boolean(activeEvidenceField && !activeBox) || (!hasEvidence && Boolean(activeFile));
  const showPdfFallback = Boolean(activeEvidenceField && isPdf);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <section className="overflow-hidden rounded-lg border border-border bg-muted/20 lg:sticky lg:top-3">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-0 text-xs font-medium hover:bg-transparent">
                <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" />
                <span>{open ? "Source document" : "View source document"}</span>
              </Button>
            </CollapsibleTrigger>
            {activeEvidenceField && (
              <div className="pl-5 text-[10px]">
                <p className="truncate text-primary">Reviewing: {getEvidenceLabel(activeEvidenceField)}</p>
                {showPdfFallback ? (
                  <p className="text-muted-foreground">PDF location preview requires rescan/rendered page evidence.</p>
                ) : showLegacyFallback ? (
                  <p className="text-muted-foreground">Location unavailable — rescan to enable source highlighting.</p>
                ) : activeBox ? (
                  <p className="text-muted-foreground">Page {activeBox.page} · highlighted source evidence</p>
                ) : null}
              </div>
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
                  <span className="min-w-[76px] text-center font-mono text-[11px] text-muted-foreground">{pageIndex + 1} / {files.length}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Next page" aria-label="Next page" disabled={pageIndex === files.length - 1} onClick={() => changePage(pageIndex + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}><Minus className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Fit document" aria-label="Fit document" onClick={() => { setZoom(1); setRotation(0); }}><Maximize2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.1))}><Plus className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Rotate counterclockwise" aria-label="Rotate counterclockwise" onClick={() => setRotation((value) => value - 90)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Rotate clockwise" aria-label="Rotate clockwise" onClick={() => setRotation((value) => value + 90)}><RotateCw className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              <div ref={scrollRef} className="bani-visible-scrollbar max-h-[68vh] overflow-auto bg-background/40 p-3">
                {isPdf ? (
                  <div className="space-y-2">
                    <iframe src={activeUrl} title={activeFile.name} className="h-[62vh] min-h-[420px] w-full rounded-md border border-border bg-background" />
                    {activeEvidenceField && <p className="px-1 text-[11px] text-muted-foreground">PDF location preview requires rescan/rendered page evidence.</p>}
                  </div>
                ) : (
                  <div className="flex min-w-max justify-center">
                    <div
                      className="relative origin-top transition-transform duration-150"
                      style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
                    >
                      <img src={activeUrl} alt={`Source invoice page ${pageIndex + 1}`} className="block h-auto max-w-full object-contain" />
                      {activeBox && activeBox.page === pageIndex + 1 && (
                        <div
                          ref={overlayRef}
                          aria-label={`${getEvidenceLabel(activeEvidenceField)} source evidence`}
                          className="pointer-events-none absolute animate-pulse rounded-sm border-2 border-primary bg-primary/20 shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]"
                          style={{ left: `${activeBox.x * 100}%`, top: `${activeBox.y * 100}%`, width: `${activeBox.width * 100}%`, height: `${activeBox.height * 100}%` }}
                        >
                          <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">{getEvidenceLabel(activeEvidenceField)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bani-visible-scrollbar flex gap-1.5 overflow-x-auto border-t border-border/70 p-2 pb-2.5">
                {files.map((file, index) => (
                  <Button key={`${file.name}-${index}`} variant={index === pageIndex ? "secondary" : "ghost"} size="sm" className="h-8 max-w-[150px] shrink-0 gap-1.5 px-2 text-[10px]" title={file.name} onClick={() => changePage(index)}>
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
