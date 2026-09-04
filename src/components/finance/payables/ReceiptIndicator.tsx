import { Paperclip } from "lucide-react";

/** Compact receipt icon + count. Renders nothing when no receipts exist. */
export function ReceiptIndicator({ count, onClick }: { count: number; onClick: () => void }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${count} payment receipt${count > 1 ? "s" : ""}`}
      aria-label={`View ${count} payment receipt${count > 1 ? "s" : ""}`}
      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
    >
      <Paperclip className="h-3 w-3" />
      {count}
    </button>
  );
}
