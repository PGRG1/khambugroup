import { useLayoutEffect, useRef, useState } from "react";
import { AudioLines, History, Mic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { fitHint } from "./FloatingBani";

const HINT = "Chat with your finance team";
const canDictate = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

/**
 * Home's chat bar as it looks before Bani is ready: the same classes and rows as the real
 * composer ("Your chats" + the pill), so it is exactly the same size and nothing moves when the
 * real one arrives. It does nothing except remember a tap, so the real input can take focus.
 */
export function HomeComposerPlaceholder({ onTap }: { onTap: () => void }) {
  const isMobile = useIsMobile();
  const input = useRef<HTMLTextAreaElement>(null);
  const [hint, setHint] = useState(HINT);
  useLayoutEffect(() => {
    const el = input.current; if (!el) return;
    const fit = () => setHint(fitHint(el, HINT));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="floating-bani" aria-hidden="true" onPointerDown={onTap}>
      <section className={`floating-bani-panel is-home ${isMobile ? "is-mobile" : ""}`}>
        <div className="floating-bani-main">
          <button type="button" tabIndex={-1} className="floating-bani-resume"><History className="h-[15px] w-[15px]" />Your chats</button>
          <form className="floating-bani-composer" onSubmit={(e) => e.preventDefault()}>
            <div className="floating-bani-row floating-bani-typing">
              <Button variant="ghost" type="button" tabIndex={-1} className="floating-bani-plus"><Plus className="h-5 w-5" /></Button>
              <textarea ref={input} rows={1} readOnly tabIndex={-1} placeholder={hint} className="floating-bani-input" />
              {canDictate && <Button variant="ghost" type="button" tabIndex={-1} className="floating-bani-mic"><Mic className="h-[18px] w-[18px]" /></Button>}
              <Button variant="ghost" type="button" tabIndex={-1} className="floating-bani-send"><AudioLines className="h-5 w-5" /></Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
