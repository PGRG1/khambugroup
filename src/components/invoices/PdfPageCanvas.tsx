import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { canvasBackingSize } from "@/utils/pdfViewerState";
import type { Size } from "@/utils/invoiceViewerTransform";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPageCanvasProps {
  url: string;
  fileName: string;
  pageNumber: number;
  onDocumentLoad: (pageCount: number) => void;
  onPageSize: (size: Size) => void;
  onOpenOriginal: () => void;
}

export default function PdfPageCanvas({ url, fileName, pageNumber, onDocumentLoad, onPageSize, onOpenOriginal }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [attempt, setAttempt] = useState(0);
  const [logical, setLogical] = useState<Size>({ width: 0, height: 0 });

  // Load the document (per file / retry)
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    const task = pdfjsLib.getDocument({ url });
    task.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        onDocumentLoad(doc.numPages);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to open this PDF.";
        setError(/password/i.test(message) ? "This PDF is password protected." : message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      const doc = docRef.current;
      docRef.current = null;
      void doc?.destroy();
      void task.destroy().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, attempt]);

  // Render the active page (never re-renders for CSS zoom/rotation)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      try {
        setStatus("loading");
        const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const size = { width: Math.round(viewport.width), height: Math.round(viewport.height) };
        const backing = canvasBackingSize(size, typeof window !== "undefined" ? window.devicePixelRatio : 1);
        canvas.width = backing.width;
        canvas.height = backing.height;
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas rendering is unavailable.");
        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: backing.scale }) });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        renderTaskRef.current = null;
        setLogical(size);
        onPageSize(size);
        setStatus("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === "RenderingCancelledException") return;
        setError(err instanceof Error ? err.message : "Unable to render this page.");
        setStatus("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, status === "error" ? attempt : attempt, url]);

  if (status === "error") {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <AlertTriangle className="h-7 w-7 text-destructive/70" />
        <p className="max-w-[280px]">{error || "This PDF could not be displayed."}</p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onOpenOriginal}>
            <ExternalLink className="h-3.5 w-3.5" /> Open original
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${fileName} — page ${pageNumber}`}
        className="block select-none bg-white"
        style={logical.width ? { width: logical.width, height: logical.height } : undefined}
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
    </>
  );
}
