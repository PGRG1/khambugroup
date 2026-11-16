import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseAttachmentPaths } from "@/utils/invoiceAttachments";

type Page = { url: string; isPdf: boolean };

/**
 * Every page of the invoice, each shown whole (scaled to fit, never cropped).
 * Phone: a swipeable strip with "1 / 4". Computer: a scrolling column.
 * Tapping a page opens the full-size viewer.
 */
export function InvoicePages({ fileUrl, layout, onOpen }: { fileUrl: string | null | undefined; layout: "strip" | "column"; onOpen: () => void }) {
  const paths = parseAttachmentPaths(fileUrl);
  const key = paths.join(",");
  const [pages, setPages] = useState<Page[] | null>(null);
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setPages(null);
    setCurrent(0);
    if (!paths.length) { setPages([]); return; }
    Promise.all(paths.map(async path => {
      const { data } = await supabase.storage.from("invoice-files").createSignedUrl(path, 3600);
      return { url: data?.signedUrl || "", isPdf: /\.pdf$/i.test(path) };
    })).then(result => { if (active) setPages(result.filter(p => p.url)); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!paths.length) return null;
  const count = pages?.length ?? paths.length;

  const page = (p: Page | null, i: number) => (
    <button
      key={i}
      type="button"
      onClick={onOpen}
      aria-label={`Open page ${i + 1} of ${count}`}
      className={`invoice-page relative flex items-center justify-center overflow-hidden rounded-[10px] border border-border bg-[#F4F7F5] ${layout === "strip" ? "h-[220px] shrink-0 snap-start " + (count > 1 ? "w-[82%]" : "w-full") : "h-[360px] w-full shrink-0"}`}
    >
      {!p ? <span className="h-full w-full animate-pulse bg-muted/60" />
        : p.isPdf ? <span className="flex flex-col items-center gap-1.5 text-[12px] text-muted-foreground"><FileText className="h-7 w-7" />PDF · tap to open</span>
        : <img src={p.url} alt={`Invoice page ${i + 1}`} loading="lazy" className="h-full w-full object-contain p-2" />}
      {count > 1 && <span className={`absolute top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] text-foreground shadow-sm td-num ${layout === "strip" ? "right-2" : "left-2"}`}>{layout === "strip" ? `${i + 1} / ${count}` : `Page ${i + 1}`}</span>}
    </button>
  );

  const items = pages ?? paths.map(() => null);

  if (layout === "column") {
    return <div className="flex flex-col gap-3" aria-label="Invoice pages">{items.map(page)}</div>;
  }

  return <div aria-label="Invoice pages">
    <div
      ref={strip}
      className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
      onScroll={e => { const el = e.currentTarget; const w = el.firstElementChild instanceof HTMLElement ? el.firstElementChild.offsetWidth + 10 : el.clientWidth; setCurrent(Math.min(count - 1, Math.round(el.scrollLeft / w))); }}
    >
      {items.map(page)}
    </div>
    {count > 1 && <div className="mt-2 flex justify-center gap-1.5" aria-hidden>{items.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-foreground/70" : "w-1.5 bg-foreground/20"}`} />)}</div>}
  </div>;
}
