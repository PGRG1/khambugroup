// Dictation for the Ask Bani box: one MediaRecorder capture (no Web Speech competing
// for the mic), a live analyser for the waveform, and the existing bani-stt path.
// The transcript is returned for editing; nothing is sent automatically.
import { useCallback, useEffect, useRef, useState } from "react";
import { voiceDeadline, micLevelFromRms } from "@/hooks/useVoiceConversation";

export type DictationState = "idle" | "starting" | "recording" | "transcribing";
type Params = {
  getAuth: () => { token: string | null; tenantId: string | null };
  onError: (message: string) => void;
};

const MAX_MS = 60000;
const STOP_FLUSH_MS = 3000;
const STT_MS = 25000;

/** Join a dictated transcript onto an existing draft without losing it. */
export function joinDraft(draft: string, dictated: string): string {
  const a = draft.trimEnd();
  const b = dictated.trim();
  if (!b) return draft;
  return a ? `${a} ${b}` : b;
}

export function useDictation({ getAuth, onError }: Params) {
  const [state, setState] = useState<DictationState>("idle");
  const stateRef = useRef<DictationState>("idle");
  const set = (s: DictationState) => { stateRef.current = s; setState(s); };
  const paramsRef = useRef({ getAuth, onError });
  paramsRef.current = { getAuth, onError };
  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bufRef = useRef<Float32Array | null>(null);

  const release = () => {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { rec.ondataavailable = null; rec.onstop = null; rec.onerror = null; if (rec.state !== "inactive") { try { rec.stop(); } catch { /* ignore */ } } }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    chunksRef.current = [];
  };

  /** Live mic level 0..1 for the waveform; 0 on silence or when not recording. */
  const getLevel = useCallback((): number => {
    const an = analyserRef.current;
    if (!an || stateRef.current !== "recording") return 0;
    if (!bufRef.current || bufRef.current.length !== an.fftSize) bufRef.current = new Float32Array(an.fftSize);
    const buf = bufRef.current;
    an.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return micLevelFromRms(Math.sqrt(sum / buf.length));
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    release();
    set("idle");
  }, []);

  const start = useCallback(() => {
    if (stateRef.current !== "idle") return; // double taps are ignored
    if (!supported) { paramsRef.current.onError("Dictation isn't supported in this browser. Type your question instead."); return; }
    const session = ++sessionRef.current;
    set("starting");
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        if (session !== sessionRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        try {
          const ctx = new AudioContext();
          ctxRef.current = ctx;
          if (ctx.state === "suspended") ctx.resume().catch(() => {});
          const an = ctx.createAnalyser();
          an.fftSize = 1024;
          // Analyser only — never connected to the speakers, so no feedback.
          ctx.createMediaStreamSource(stream).connect(an);
          analyserRef.current = an;
        } catch { /* waveform stays flat; recording still works */ }
        const mime = MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported?.("audio/mp4") ? "audio/mp4" : "";
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        chunksRef.current = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
        rec.onerror = () => { if (session === sessionRef.current) { paramsRef.current.onError("Recording failed. Try again."); cancel(); } };
        recRef.current = rec;
        rec.start();
        set("recording");
        maxTimerRef.current = setTimeout(() => { void confirmRef.current().then((t) => { if (t) onMaxRef.current?.(t); }); }, MAX_MS);
      })
      .catch((e: unknown) => {
        if (session !== sessionRef.current) return;
        const name = (e as { name?: string })?.name;
        paramsRef.current.onError(name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone is blocked. Allow microphone access in your browser settings."
          : name === "NotFoundError" ? "No microphone was found." : "Microphone unavailable. Try again.");
        release();
        set("idle");
      });
  }, [supported, cancel]);

  /** Stop recording, flush final audio, transcribe. Resolves the text once (null if cancelled/failed). */
  const confirm = useCallback(async (): Promise<string | null> => {
    if (stateRef.current !== "recording") { if (stateRef.current === "starting") cancel(); return null; }
    const session = sessionRef.current;
    const rec = recRef.current;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    set("transcribing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const blob = await voiceDeadline(new Promise<Blob>((resolve) => {
        if (!rec || rec.state === "inactive") return resolve(new Blob(chunksRef.current));
        rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
        try { rec.requestData?.(); } catch { /* ignore */ }
        rec.stop();
      }), STOP_FLUSH_MS, controller.signal, "Recording did not finish. Try again.");
      recRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop()); // mic released before upload
      if (session !== sessionRef.current) return null;
      if (!blob.size) throw new Error("Didn't catch that — try again");
      const { token, tenantId } = paramsRef.current.getAuth();
      if (!token || !tenantId) throw new Error("Dictation needs an active workspace.");
      const form = new FormData();
      form.append("file", new File([blob], "dictation.webm", { type: blob.type || "audio/webm" }));
      form.append("tenant_id", tenantId);
      const data = await voiceDeadline((async () => {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bani-stt`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: form,
          signal: controller.signal,
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(body.error || "Transcription failed. Try again.");
        return body as { text?: string };
      })(), STT_MS, controller.signal, "Transcription timed out. Try again.", () => controller.abort());
      if (session !== sessionRef.current) return null;
      const text = (data.text ?? "").trim();
      if (!text) throw new Error("Didn't catch that — try again");
      return text;
    } catch (e) {
      if (session !== sessionRef.current || (e as { name?: string })?.name === "AbortError") return null;
      paramsRef.current.onError(e instanceof Error ? e.message : "Dictation failed. Try again.");
      return null;
    } finally {
      if (session === sessionRef.current) { abortRef.current = null; release(); set("idle"); }
    }
  }, [cancel]);
  const confirmRef = useRef(confirm);
  const onMaxRef = useRef<((t: string) => void) | null>(null);
  confirmRef.current = confirm;

  useEffect(() => () => { sessionRef.current++; abortRef.current?.abort(); release(); }, []);

  /** Where text goes when the 60s limit auto-finishes a recording. */
  const setOnAutoFinish = useCallback((fn: (t: string) => void) => { onMaxRef.current = fn; }, []);
  return { supported, state, active: state !== "idle", start, cancel, confirm, getLevel, setOnAutoFinish };
}
