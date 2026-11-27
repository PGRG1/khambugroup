// View a file the person attached in Bani chat. The file never leaves the browser: it is shown from memory
// (an object URL made on open and released on close). Images and PDFs show in place; anything else downloads.
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

export function ChatFileViewer({ file, onClose }: { file: File; onClose: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const type = file.type || "";
  const isImage = type.startsWith("image/");
  const isPdf = type === "application/pdf" || /\.pdf$/i.test(file.name);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-[rgba(15,23,20,.72)] p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={file.name} onClick={onClose}>
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 pb-2 text-white" onClick={e => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-[14px]" title={file.name}>{file.name}</span>
        <a href={url} download={file.name} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label="Download" title="Download"><Download className="h-4 w-4" /></a>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label="Close" title="Close" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center overflow-auto rounded-xl bg-white" onClick={e => e.stopPropagation()}>
        {isImage ? <img src={url} alt={file.name} className="max-h-full max-w-full object-contain" />
          : isPdf ? <iframe src={url} title={file.name} className="h-full w-full rounded-xl" />
          : <div className="p-8 text-center text-[14px] text-muted-foreground">This file can't be shown here.<br /><a href={url} download={file.name} className="mt-3 inline-block text-[#1F6B5E] underline">Download {file.name}</a></div>}
      </div>
    </div>,
    document.body,
  );
}
