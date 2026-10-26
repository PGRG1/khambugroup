import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import "./kit.css";

/** Right-hand sheet on desktop, full-screen bottom sheet on phones. */
export function DetailPanel({ open, onOpenChange, kind, title, headline, status, children }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  kind: string; title: string; headline?: ReactNode; status?: ReactNode; children: ReactNode;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={mobile ? "bottom" : "right"}
        className={`kit p-0 flex flex-col bg-white ${mobile ? "h-[100dvh] max-h-[100dvh] rounded-none" : "w-[380px] sm:max-w-[380px]"}`}>
        <div className="px-5 pt-5 pb-4 space-y-1.5 border-b" style={{ borderColor: "#ECEAE3" }}>
          <SheetDescription className="text-[12px]" style={{ color: "var(--kit-muted)" }}>{kind}</SheetDescription>
          <SheetTitle className="text-base font-semibold" style={{ color: "var(--kit-ink)" }}>{title}</SheetTitle>
          {headline && <div className="kit-headline">{headline}</div>}
          {status && <div>{status}</div>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="kit-group-h pb-1">{title}</h3>
      {children}
    </section>
  );
}

export function DetailRow({ label, value, total }: { label: string; value: ReactNode; total?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-[13px] ${total ? "kit-divider pt-2 mt-1 font-semibold" : ""}`} style={{ color: "var(--kit-ink)" }}>
      <span style={total ? undefined : { color: "#3D4842" }}>{label}</span>
      <span className="kit-num">{value}</span>
    </div>
  );
}

export function ExplainBox({ children }: { children: ReactNode }) {
  return <div className="kit-explain" role="note">{children}</div>;
}
