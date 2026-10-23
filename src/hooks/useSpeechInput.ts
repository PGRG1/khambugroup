import { useCallback, useEffect, useRef, useState } from "react";

type Options = { onTranscript: (text: string) => void; onError?: (error: string) => void };

const getCtor = (): any =>
  typeof window === "undefined" ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

/** Browser Web Speech API wrapper. No backend; nothing is sent automatically. */
export function useSpeechInput({ onTranscript, onError }: Options) {
  const [supported] = useState(() => !!getCtor());
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const cbRef = useRef({ onTranscript, onError });
  cbRef.current = { onTranscript, onError };

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* noop */ }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    stop();
    const rec = new Ctor();
    rec.interimResults = true;
    rec.continuous = false;
    rec.lang = navigator.language || "en-GB";
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      cbRef.current.onTranscript(text);
    };
    rec.onerror = (e: any) => {
      const msg = e?.error || "error";
      setError(msg);
      if (msg !== "no-speech" && msg !== "aborted") cbRef.current.onError?.(msg);
      recRef.current = null;
      setListening(false);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
      cbRef.current.onError?.("start-failed");
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, start, stop, error };
}
