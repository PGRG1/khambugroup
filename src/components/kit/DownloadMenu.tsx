import { useState } from "react";
import { Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./kit.css";

export type DownloadFormat = "excel" | "csv" | "pdf";
const NAMES: Record<DownloadFormat, string> = { excel: "Excel", csv: "CSV", pdf: "PDF" };

/** One download button. With one format it downloads straight away; with more it opens a short list. */
export function DownloadMenu({ formats, onDownload, label = "Download", disabled }: {
  formats: DownloadFormat[]; onDownload: (f: DownloadFormat) => void; label?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = (props: object = {}) => (
    <button type="button" className="kit kit-btn kit-btn-secondary kit-btn-icon" aria-label={label} title={label} disabled={disabled} {...props}>
      <Download className="h-4 w-4" />
    </button>
  );
  if (formats.length === 1) return button({ onClick: () => onDownload(formats[0]) });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button()}</PopoverTrigger>
      <PopoverContent align="end" className="kit kit-pop w-40 p-1.5" role="menu">
        {formats.map((f) => (
          <button key={f} type="button" role="menuitem" className="kit-sort-row" onClick={() => { setOpen(false); onDownload(f); }}>
            <span className="kit-row-label">{NAMES[f]}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
