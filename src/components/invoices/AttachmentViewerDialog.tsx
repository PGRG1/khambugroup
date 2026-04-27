import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface AttachmentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  title?: string;
  bucket?: string;
}

interface SignedFile {
  url: string;
  isPdf: boolean;
  index: number;
}

export default function AttachmentViewerDialog({ open, onOpenChange, fileUrl, title, bucket = "invoice-files" }: AttachmentViewerDialogProps) {
  const [files, setFiles] = useState<SignedFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !fileUrl) {
      setFiles([]);
      return;
    }

    const paths = fileUrl.split(",").map(p => p.trim()).filter(Boolean);
    if (paths.length === 0) return;

    setLoading(true);
    Promise.all(
      paths.map(async (path, index) => {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        const ext = path.split(".").pop()?.toLowerCase() || "";
        return {
          url: data?.signedUrl || "",
          isPdf: ext === "pdf",
          index,
        };
      })
    ).then(results => {
      setFiles(results.filter(f => f.url));
      setLoading(false);
    });
  }, [open, fileUrl, bucket]);

  const totalPages = files.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-base">
            {title || "Attachments"} · {totalPages} {totalPages === 1 ? "page" : "pages"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading attachments...</span>
              </div>
            ) : files.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No attachments found.</p>
            ) : (
              files.map(file => (
                <div key={file.index} className="space-y-1.5">
                  {totalPages > 1 && (
                    <p className="text-xs font-medium text-muted-foreground">
                      Page {file.index + 1} of {totalPages}
                    </p>
                  )}
                  {file.isPdf ? (
                    <iframe
                      src={file.url}
                      className="w-full rounded-lg border bg-muted"
                      style={{ height: "80vh" }}
                      title={`Page ${file.index + 1}`}
                    />
                  ) : (
                    <img
                      src={file.url}
                      alt={`Page ${file.index + 1}`}
                      className="w-full rounded-lg border shadow-sm"
                      loading="lazy"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
