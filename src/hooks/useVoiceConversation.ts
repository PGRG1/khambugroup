// Two-way voice conversation loop for Bani AI.
// listening → transcribing → thinking (spoken filler) → speaking (spoken summary) → listening.
// Uses getUserMedia + MediaRecorder (never the Web Speech API), the bani-stt and
// bani-tts edge functions, and the normal chat send() path with voice flags.
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";
export type SpeakEvent = { kind: "filler" | "summary"; text: string };

type SendOpts = {
  voice: boolean;
  voiceLanguage: string;
  onSpeak?: (s: SpeakEvent) => void;
  onStatus?: (label: string) => void;
};

type Params = {
  active: boolean;
  getAuth: () => { token: string | null; tenantId: string | null };
  sendQuestion: (text: string, opts: SendOpts) => Promise<void>;
  onError: (message: string) => void;
};

const SILENCE_MS = 1200;
const MAX_TURN_MS = 30000;
const NO_SPEECH_MS = 8000;
const CALIBRATE_MS = 300;

const LANG_TAGS: Record<string, string> = {
  en: "en", zh: "zh-HK", yue: "zh-HK", ne: "ne", hi: "hi", tl: "tl", fil: "tl", id: "id",
};

function speechLangTag(lang: string): string {
  const l = (lang || "en").toLowerCase();
  for (const k of Object.keys(LANG_TAGS)) if (l.startsWith(k)) return LANG_TAGS[k];
  return "en";
}

/** Decode 24 kHz signed 16-bit LE PCM base64 chunks, carrying odd trailing bytes. */
function decodePCM(pending: Uint8Array, incoming: Uint8Array) {
  const bytes = new Uint8Array(pending.length + incoming.length);
  bytes.set(pending);
  bytes.set(incoming, pending.length);
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(usable / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, pending: bytes.slice(usable) };
}

export function useVoiceConversation({ active, getAuth, sendQuestion, onError }: Params) {
  const [state, setState] = useState<VoiceState>("idle");
  const [caption, setCaption] = useState("");
  const [language, setLanguage] = useState("en");
  const [needsTap, setNeedsTap] = useState(false);
  const [level, setLevel] = useState(0);

  const stateRef = useRef<VoiceState>("idle");
  stateRef.current = state;
  const activeRef = useRef(active);
  activeRef.current = active;

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const playAbortRef = useRef<AbortController | null>(null);
  const playSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const lastLevelSetRef = useRef(0);
  const ttsCountRef = useRef(0);
  const spokeRef = useRef(false); // a summary was played for the current turn
  const generationRef = useRef(0); // invalidates stale async continuations

  const setLevelThrottled = (v: number) => {
    const now = performance.now();
    if (now - lastLevelSetRef.current < 90) return;
    lastLevelSetRef.current = now;
    setLevel(v);
  };

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const stopPlayback = () => {
    playAbortRef.current?.abort();
    playAbortRef.current = null;
    for (const s of playSourcesRef.current) { try { s.stop(); } catch { /* done */ } }
    playSourcesRef.current.clear();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const stopMic = () => {
    cancelAnimationFrame(rafRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* ignore */ } }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    micAnalyserRef.current = null;
  };

  /** Full cleanup — voice mode ends. */
  const end = useCallback(() => {
    generationRef.current++;
    clearTimers();
    stopPlayback();
    stopMic();
    abortRef.current?.abort();
    abortRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;
    setState("idle");
    setCaption("");
    setLevel(0);
    setNeedsTap(false);
  }, []);

  // End everything when voice mode is turned off or the page unmounts.
  useEffect(() => {
    if (!active) end();
  }, [active, end]);
  useEffect(() => end, [end]);

  // Pause mic + audio while the page is hidden.
  useEffect(() => {
    if (!active) return;
    const onVis = () => {
      if (document.hidden) {
        stopPlayback();
        if (stateRef.current === "listening") {
          stopMic();
          setState("idle");
          setNeedsTap(true);
          setCaption("Tap the orb to talk");
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active]);

  /** RMS level from an analyser, 0..1. */
  const readLevel = (an: AnalyserNode): number => {
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  };

  /** Play text through bani-tts (PCM SSE) with a browser-speech fallback. */
  const speak = async (text: string, gen: number): Promise<void> => {
    const { token } = getAuth();
    if (!token || !text.trim() || gen !== generationRef.current) return;
    if (ttsCountRef.current >= 3) return; // cost cap per turn
    ttsCountRef.current++;

    const controller = new AbortController();
    playAbortRef.current = controller;
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bani-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text: text.slice(0, 600) }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`tts ${resp.status}`);

      if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      const ctx = playCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      playAnalyserRef.current = analyser;

      let playhead = 0;
      let pending = new Uint8Array(0);
      let completed = false;
      let played = 0;
      const playbacks: Promise<void>[] = [];

      const parser = (data: string) => {
        const ev = JSON.parse(data);
        if (ev.type === "error" || ev.error) throw new Error("speech stream error");
        if (ev.type === "speech.audio.done") { completed = true; return; }
        if (ev.type !== "speech.audio.delta" || !ev.audio) return;
        const decoded = decodePCM(pending, Uint8Array.from(atob(ev.audio), (c) => c.charCodeAt(0)));
        pending = new Uint8Array(decoded.pending);
        if (!decoded.samples.length) return;
        played += decoded.samples.length;
        const buffer = ctx.createBuffer(1, decoded.samples.length, 24000);
        buffer.copyToChannel(decoded.samples, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        playSourcesRef.current.add(source);
        playbacks.push(new Promise<void>((resolve) => {
          source.onended = () => { playSourcesRef.current.delete(source); resolve(); };
        }));
        playhead = Math.max(playhead, ctx.currentTime + 0.05);
        source.start(playhead);
        playhead += buffer.duration;
      };

      const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (gen !== generationRef.current) { reader.cancel(); return; }
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (payload && payload !== "[DONE]") parser(payload);
          }
        }
      }
      if (!completed || !played) throw new Error("incomplete speech");
      await Promise.all(playbacks);
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || gen !== generationRef.current) return;
      // Fallback: browser speech synthesis with a matching-language voice.
      await new Promise<void>((resolve) => {
        try {
          const synth = window.speechSynthesis;
          if (!synth) return resolve();
          const tag = speechLangTag(language);
          const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
          utter.lang = tag;
          const match = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(tag.slice(0, 2)));
          if (match) utter.voice = match;
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          synth.speak(utter);
          // Caption-only fallback: if nothing starts, don't hang the loop.
          timersRef.current.push(setTimeout(() => resolve(), 12000));
        } catch {
          resolve();
        }
      });
    } finally {
      playAnalyserRef.current = null;
    }
  };

  /** Transcribe the recorded blob, then send it through the normal chat path. */
  const transcribeAndSend = async (blob: Blob, gen: number) => {
    const { token, tenantId } = getAuth();
    if (!token || gen !== generationRef.current) return;
    setState("transcribing");
    setCaption("Transcribing…");
    try {
      const form = new FormData();
      form.append("file", new File([blob], "question.webm", { type: blob.type || "audio/webm" }));
      if (tenantId) form.append("tenant_id", tenantId);
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bani-stt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: form,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Transcription failed");
      const text = String(data.text || "").trim();
      if (data.language) setLanguage(data.language);
      if (gen !== generationRef.current) return;
      if (!text) {
        startListening();
        return;
      }
      setCaption(text);
      setState("thinking");
      ttsCountRef.current = 0;
      spokeRef.current = false;

      const onSpeak = (s: SpeakEvent) => {
        if (gen !== generationRef.current) return;
        if (s.kind === "summary") {
          // A summary replaces any still-queued/playing filler.
          stopPlayback();
          spokeRef.current = true;
          setState("speaking");
          setCaption(s.text);
          void speak(s.text, gen).then(() => {
            if (gen !== generationRef.current || !activeRef.current) return;
            startListening();
          });
        } else if (stateRef.current === "thinking") {
          void speak(s.text, gen);
        }
      };
      const onStatus = (label: string) => {
        if (gen !== generationRef.current) return;
        if (stateRef.current === "thinking") setCaption(label);
      };

      await sendQuestion(text, {
        voice: true,
        voiceLanguage: data.language || language || "en",
        onSpeak,
        onStatus,
      });
      // If the turn ended without a spoken summary, go back to listening.
      if (gen === generationRef.current && activeRef.current && !spokeRef.current && stateRef.current === "thinking") {
        startListening();
      }
    } catch (e) {
      if (gen !== generationRef.current) return;
      onError(e instanceof Error ? e.message : "Voice error");
      startListening();
    }
  };

  /** Begin recording + silence detection. */
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    const gen = generationRef.current;
    stopPlayback();
    stopMic();
    setLevel(0);

    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }
    } catch {
      onError("Microphone unavailable. Check your browser permissions.");
      end();
      return;
    }
    if (gen !== generationRef.current) return;

    // Mic analysis (context created inside the user's tap handler path for iOS).
    if (!micCtxRef.current) {
      try { micCtxRef.current = new AudioContext(); } catch { /* level meter optional */ }
    }
    const ctx = micCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(streamRef.current!);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
    }

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    const recorder = new MediaRecorder(streamRef.current!, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (gen !== generationRef.current || !activeRef.current) return;
      if (blob.size < 800) { startListening(); return; } // nothing meaningful recorded
      void transcribeAndSend(blob, gen);
    };
    recorder.start(250);

    setState("listening");
    setCaption("Listening…");
    setNeedsTap(false);

    // Silence / no-speech / max-turn detection.
    const startedAt = performance.now();
    let floor = 0;
    let floorSamples = 0;
    let threshold = 0.02;
    let speechStarted = false;
    let lastSpeechAt = performance.now();

    const tick = () => {
      if (gen !== generationRef.current || stateRef.current !== "listening") return;
      const now = performance.now();
      const an = micAnalyserRef.current;
      const rms = an ? readLevel(an) : 0;
      if (now - startedAt < CALIBRATE_MS) {
        floor += rms;
        floorSamples++;
        if (floorSamples > 0) threshold = Math.max(0.012, (floor / floorSamples) * 2.5);
      } else {
        if (rms > threshold) {
          speechStarted = true;
          lastSpeechAt = now;
        }
        setLevelThrottled(Math.min(1, rms * 6));
        if (speechStarted && now - lastSpeechAt > SILENCE_MS) return finishTurn();
        if (!speechStarted && now - startedAt > NO_SPEECH_MS) {
          stopMic();
          setState("idle");
          setNeedsTap(true);
          setCaption("Tap the orb to talk");
          setLevel(0);
          return;
        }
        if (now - startedAt > MAX_TURN_MS) return finishTurn();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const finishTurn = () => {
      cancelAnimationFrame(rafRef.current);
      setLevel(0);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try { rec.stop(); } catch { startListening(); }
      } else {
        startListening();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, onError]);

  /** Enter voice mode: prime audio inside the user's tap (iOS unlock), then listen. */
  const start = useCallback(() => {
    generationRef.current++;
    clearTimers();
    stopPlayback();
    try {
      if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playCtxRef.current.resume().catch(() => {});
      if (!micCtxRef.current) micCtxRef.current = new AudioContext();
      micCtxRef.current.resume().catch(() => {});
    } catch { /* audio unlock best-effort */ }
    void startListening();
  }, [startListening]);

  /** ↑ while listening: send the current recording immediately. */
  const sendNow = useCallback(() => {
    if (stateRef.current !== "listening") return;
    cancelAnimationFrame(rafRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* onstop handles the rest */ }
    }
  }, []);

  /** Tap the orb: interrupt thinking/speaking back to listening; resume from idle. */
  const interrupt = useCallback(() => {
    const s = stateRef.current;
    if (s === "thinking" || s === "speaking") {
      generationRef.current++; // cancels in-flight send continuations
      stopPlayback();
      abortRef.current?.abort();
      void startListening();
    } else if (s === "idle") {
      void startListening();
    }
  }, [startListening]);

  /** Register the in-flight chat request so interrupt can abort it. */
  const trackRequest = useCallback((controller: AbortController | null) => {
    abortRef.current = controller;
  }, []);

  return { state, caption, level, needsTap, language, start, end, interrupt, sendNow, trackRequest, setCaption };
}
