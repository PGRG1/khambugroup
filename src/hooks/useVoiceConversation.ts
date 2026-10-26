// Two-way voice conversation loop for Bani AI.
// listening → transcribing → thinking (spoken filler) → speaking (spoken summary) → listening.
// Uses getUserMedia + MediaRecorder, the bani-stt and bani-tts edge functions, and
// the normal chat send() path with voice flags. The browser Web Speech API runs in
// on desktop ONLY to show live words (and as an English fast path) — it never replaces
// the recorder, and recording must never break because of it.
//
// Phone-safety rules:
// - start() must be called directly from a tap. It marks voice active, unlocks
//   the playback <audio> element (silent clip) and calls getUserMedia
//   synchronously (no await first). Playback uses an <audio> element, not an
//   AudioContext, because the iPhone silent switch mutes WebAudio output.
// - One mic stream per voice session; only the MediaRecorder starts/stops per
//   turn. The track stays ENABLED while Bani speaks (echo cancellation on) so
//   the user can interrupt by talking; tracks are released only in end().
// - stateRef is written synchronously via setVoiceState so async callbacks never
//   read a stale state.
import { useCallback, useEffect, useRef, useState } from "react";
import { fillerStillWanted } from "./voiceFiller";

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";
export type SpeakEvent = { kind: "filler" | "summary"; text: string; stage?: "first" | "more" };
export type Reveal = { prior: string; text: string; durationMs: number; id: number } | null;

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

export const SILENCE_MS = 1800;
export const SPEECH_START_MS = 250;
const MAX_TURN_MS = 30000;
const NO_SPEECH_MS = 8000;
const NOTICE_MS = 2000;
const ACKS_ENABLED = true;
const BARGE_MS = 350;
const BARGE_GUARD_MS = 400;
const BARGE_MISS_LIMIT = 2;
export const EMPTY_NOTICE = "Didn't catch that — try again";

/** Deadline includes body reads, not just response headers, and cancels on replacement. */
export function voiceDeadline<T>(work: Promise<T>, ms: number, signal: AbortSignal, message: string, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); };
    const aborted = () => { cleanup(); reject(new DOMException("Voice turn canceled", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(message)); onTimeout?.(); }, ms);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    work.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

const LANG_TAGS: Record<string, string> = {
  en: "en", zh: "zh-HK", yue: "zh-HK", ne: "ne", hi: "hi", tl: "tl", fil: "tl", id: "id",
};

function speechLangTag(lang: string): string {
  const l = (lang || "en").toLowerCase();
  for (const k of Object.keys(LANG_TAGS)) if (l.startsWith(k)) return LANG_TAGS[k];
  return "en";
}

// Short spoken acknowledgements, pre-generated once per session so they play
// with zero network delay the moment a turn ends.
const ACKS: Record<string, string[]> = {
  en: ["I'm looking at your revenue figures now.", "I'm checking those supplier prices now.", "I'm comparing the revenue figures for those periods now."],
};

/** Wrap 24 kHz signed 16-bit LE mono PCM bytes in a WAV header for <audio> playback. */
function pcmToWav(pcm: Uint8Array<ArrayBuffer>): Blob {
  const sr = 24000;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const wstr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true);
  wstr(8, "WAVE"); wstr(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wstr(36, "data"); v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}

export const ENVELOPE_STEP_S = 0.02;
/** RMS envelope (0..1) of 24 kHz s16le PCM, one value per 20ms window. */
export function pcmEnvelope(pcm: Uint8Array): Float32Array {
  const samples = Math.floor(pcm.length / 2);
  const win = Math.round(24000 * ENVELOPE_STEP_S);
  const out = new Float32Array(Math.ceil(samples / win));
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
  for (let w = 0; w < out.length; w++) {
    let sum = 0; let n = 0;
    for (let i = w * win; i < Math.min(samples, (w + 1) * win); i++) { const v = view.getInt16(i * 2, true) / 32768; sum += v * v; n++; }
    out[w] = Math.min(1, Math.sqrt(sum / Math.max(1, n)) * 4);
  }
  return out;
}
/** Envelope value at a playback time; 0 past the end. */
export function envelopeAt(env: Float32Array, t: number): number {
  const i = Math.floor(t / ENVELOPE_STEP_S);
  return i >= 0 && i < env.length ? env[i] : 0;
}
/** Map mic RMS to 0..1 above the noise floor; silence stays 0. */
export function micLevelFromRms(rms: number, floor = 0.003): number {
  const over = rms - Math.max(0.002, floor * 1.5);
  return over <= 0 ? 0 : Math.min(1, over * 9);
}

/** 24 kHz mono WAV with a single silent sample — used to unlock the <audio> element on the entry tap. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAA";

/**
 * Adaptive speech detector (pure, unit-tested). Feed RMS frames with timestamps.
 * The noise floor follows quiet frames (slow moving average); speech starts after
 * SPEECH_START_MS above threshold; the turn ends after SILENCE_MS of quiet.
 */
export function createSpeechDetector(initialFloor = 0.001) {
  let floor = initialFloor;
  let aboveSince: number | null = null;
  let speechStarted = false;
  let lastLoudAt = 0;
  const threshold = () => Math.max(0.003, floor * 2.5);
  return {
    get speechStarted() { return speechStarted; },
    get threshold() { return threshold(); },
    get floor() { return floor; },
    /** Returns "end" when the turn should finish. */
    push(rms: number, now: number): "none" | "speech" | "end" {
      const loud = rms > threshold();
      if (!loud) {
        floor = floor * 0.95 + rms * 0.05;
        aboveSince = null;
      } else {
        if (aboveSince === null) aboveSince = now;
        lastLoudAt = now;
        if (!speechStarted && now - aboveSince >= SPEECH_START_MS) {
          speechStarted = true;
          return "speech";
        }
      }
      if (speechStarted && !loud && now - lastLoudAt > SILENCE_MS) return "end";
      return "none";
    },
  };
}

/** Split a spoken summary into up to 3 sentences (tail merged into the last). */
export function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 3) return parts.length ? parts : [text.trim()].filter(Boolean);
  return [...parts.slice(0, 2), parts.slice(2).join(" ")];
}

export function useVoiceConversation({ active, getAuth, sendQuestion, onError }: Params) {
  const [state, setState] = useState<VoiceState>("idle");
  const [language, setLanguage] = useState("en");
  const [needsTap, setNeedsTap] = useState(false);
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [userWords, setUserWords] = useState("");
  const [userWordsLive, setUserWordsLive] = useState(false);
  const [stepLabel, setStepLabel] = useState("");
  const [reveal, setReveal] = useState<Reveal>(null);
  const [notice, setNotice] = useState("");

  const stateRef = useRef<VoiceState>("idle");
  const setVoiceState = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };
  const activeRef = useRef(false);
  const languageRef = useRef("en");
  const mutedRef = useRef(false);
  // Always call the latest render's callbacks (send closes over live chat state).
  const paramsRef = useRef({ getAuth, sendQuestion, onError });
  paramsRef.current = { getAuth, sendQuestion, onError };

  const streamRef = useRef<MediaStream | null>(null);
  const streamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const finishRecordingRef = useRef<(() => void) | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageAbortRef = useRef<AbortController | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  // Playback uses an <audio> element (WAV blob), not WebAudio: on iPhone the
  // hardware silent switch mutes AudioContext output but not media elements.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number>(0);
  const bargeRafRef = useRef<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const playAbortRef = useRef<AbortController | null>(null);
  const lastLevelSetRef = useRef(0);
  const ttsCountRef = useRef(0);
  const fillerUsedRef = useRef({ turn: -1, first: false, more: false });
  const fillerPlayingRef = useRef(false);
  const fillerPromiseRef = useRef<Promise<void> | null>(null);
  const turnRef = useRef(0); // id of the current question turn
  const summaryTurnRef = useRef(-1); // turn whose summary has arrived
  const generationRef = useRef(0); // invalidates stale async continuations
  const turnEndedAtRef = useRef(0);
  const playbackStartedAtRef = useRef(0);
  const noiseFloorRef = useRef(0.005);
  const bargeDisabledRef = useRef(false);
  const bargeMissesRef = useRef(0);
  const bargePendingRef = useRef(false);
  const revealIdRef = useRef(0);
  const recogRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const ackClipsRef = useRef<Map<string, Uint8Array<ArrayBuffer>>>(new Map());
  const warmAbortRef = useRef<AbortController | null>(null);
  const playbackDoneRef = useRef<(() => void) | null>(null);
  const pendingSpeechRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ackLangsDoneRef = useRef<Set<string>>(new Set());
  // Real playback envelope for the orb: RMS per 20ms window of the PCM now on the <audio> element.
  const envelopeRef = useRef<Float32Array | null>(null);

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

  const setTrackEnabled = (on: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = on; });
  };

  const stopPlayback = () => {
    playbackDoneRef.current?.();
    playbackDoneRef.current = null;
    playAbortRef.current?.abort();
    playAbortRef.current = null;
    cancelAnimationFrame(bargeRafRef.current);
    envelopeRef.current = null;
    const el = audioElRef.current;
    if (el) { try { el.pause(); } catch { /* ignore */ } }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  };

  /** Stop the current recorder. discard=true drops the audio. */
  const stopRecorder = (discard: boolean) => {
    cancelAnimationFrame(rafRef.current);
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;
    finishRecordingRef.current = null;
    const rec = recorderRef.current as (MediaRecorder & { __discard?: boolean }) | null;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.__discard = discard;
      try { rec.stop(); } catch { /* ignore */ }
    }
  };

  /** Stop the live-words recognizer (never affects recording). */
  const stopLiveWords = () => {
    const rec = recogRef.current;
    recogRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.stop(); } catch { /* noop */ }
    }
  };

  /** Full cleanup — voice mode ends. Only place the mic tracks are released. */
  const end = useCallback(() => {
    activeRef.current = false;
    generationRef.current++;
    clearTimers();
    stopPlayback();
    stopRecorder(true);
    pendingSpeechRef.current = null;
    stopLiveWords();
    abortRef.current?.abort();
    stageAbortRef.current?.abort();
    abortRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    streamPromiseRef.current = null;
    micAnalyserRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    audioElRef.current = null;
    warmAbortRef.current?.abort();
    warmAbortRef.current = null;
    ackClipsRef.current.clear();
    ackLangsDoneRef.current.clear();
    bargeDisabledRef.current = false;
    bargeMissesRef.current = 0;
    bargePendingRef.current = false;
    mutedRef.current = false;
    stateRef.current = "idle";
    setState("idle");
    setLevel(0);
    setNeedsTap(false);
    setMuted(false);
    setUserWords("");
    setUserWordsLive(false);
    setStepLabel("");
    setReveal(null);
    setNotice("");
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
      if (!document.hidden) return;
      stopPlayback();
      if (stateRef.current === "listening") {
        stopRecorder(true);
        stopLiveWords();
        setTrackEnabled(false);
        setVoiceState("idle");
        setNeedsTap(true);
        setNotice("Tap the orb to talk");
        setLevel(0);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /** RMS level from an analyser, 0..1. */
  const readLevel = (an: AnalyserNode): number => {
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  };

  /** The one session <audio> element; created and unlocked inside the entry tap. */
  const ensureAudioEl = () => {
    if (!audioElRef.current) audioElRef.current = new Audio();
    return audioElRef.current;
  };

  /**
   * Fetch one TTS clip from bani-tts and return raw 24 kHz PCM bytes.
   * counted=true charges the per-turn cap (max 3); cached acknowledgements
   * are pre-generated with counted=false.
   */
  const fetchTtsPcm = async (text: string, token: string, gen: number, counted = true, signal?: AbortSignal, onPcm?: (pcm: Uint8Array<ArrayBuffer>) => void): Promise<Uint8Array<ArrayBuffer> | null> => {
    const current = () => signal ? !signal.aborted && activeRef.current : gen === generationRef.current;
    if (!text.trim() || !current()) return null;
    if (counted) {
      if (ttsCountRef.current >= 3) return null;
      ttsCountRef.current++;
    }
    try {
      if (!signal && !playAbortRef.current) playAbortRef.current = new AbortController();
      const ttsController = new AbortController();
      const parentSignal = signal ?? playAbortRef.current?.signal;
      const cancelTts = () => ttsController.abort();
      parentSignal?.addEventListener("abort", cancelTts, { once: true });
      if (parentSignal?.aborted) cancelTts();
      const ttsTimer = setTimeout(cancelTts, 25000);
      try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bani-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text: text.slice(0, 600) }),
        signal: ttsController.signal,
      });
      if (!resp.ok || !resp.body) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Speech unavailable (${resp.status})`);
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      let completed = false;
      const pendingAudio: Uint8Array[] = [];
      let pendingBytes = 0;
      const flushAudio = () => {
        if (!onPcm || !pendingBytes) return;
        const pcm = new Uint8Array(pendingBytes - pendingBytes % 2);
        let offset = 0;
        for (const bytes of pendingAudio) { pcm.set(bytes.subarray(0, pcm.length - offset), offset); offset += bytes.length; }
        pendingAudio.length = 0;
        pendingBytes = 0;
        if (pcm.length) onPcm(pcm);
      };
      const parser = (data: string) => {
        const ev = JSON.parse(data);
        if (ev.type === "error" || ev.error) throw new Error("speech stream error");
        if (ev.type === "speech.audio.done") { completed = true; return; }
        if (ev.type !== "speech.audio.delta" || !ev.audio) return;
        const bytes = Uint8Array.from(atob(ev.audio), (c) => c.charCodeAt(0));
        chunks.push(bytes);
        total += bytes.length;
        if (onPcm) {
          pendingAudio.push(bytes);
          pendingBytes += bytes.length;
          // Provider deltas can be 40ms. Batch two seconds to avoid media-element gaps.
          if (pendingBytes >= 96000 && pendingBytes % 2 === 0) flushAudio();
        }
      };
      const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!current()) { void reader.cancel(); return null; }
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
      if (!current()) return null;
      if (!completed || !total) throw new Error("Speech audio was incomplete");
      flushAudio();
      const pcm = new Uint8Array(total - (total % 2));
      let off = 0;
      for (const c of chunks) { pcm.set(c.subarray(0, Math.min(c.length, pcm.length - off)), off); off += c.length; }
      return pcm;
      } finally { clearTimeout(ttsTimer); parentSignal?.removeEventListener("abort", cancelTts); }
    } catch (error) {
      if (gen === generationRef.current && !signal?.aborted && !playAbortRef.current?.signal.aborted && counted) {
        paramsRef.current.onError("Bani’s voice is unavailable. Using the browser voice instead.");
      }
      return null;
    }
  };

  /** Play one PCM clip on the session <audio> element. */
  const playPcm = async (pcm: Uint8Array<ArrayBuffer>, gen: number): Promise<void> => {
    if (gen !== generationRef.current) return;
    const url = URL.createObjectURL(pcmToWav(pcm));
    audioUrlRef.current = url;
    const el = ensureAudioEl();
    envelopeRef.current = pcmEnvelope(pcm);
    el.src = url;
    playbackStartedAtRef.current = performance.now();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { el.pause(); paramsRef.current.onError("Audio stalled. Tap the orb to retry playback."); pendingSpeechRef.current = pcm; setNeedsTap(true); done(); }, Math.max(10000, pcm.length / 48 + 5000));
      const done = () => {
        clearTimeout(timer);
        playbackDoneRef.current = null;
        el.onended = null; el.onerror = null;
        envelopeRef.current = null;
        if (audioUrlRef.current === url) { URL.revokeObjectURL(url); audioUrlRef.current = null; }
        resolve();
      };
      playbackDoneRef.current = done;
      el.onended = done;
      el.onerror = () => { paramsRef.current.onError("Audio could not play. Tap the orb to try again."); setNeedsTap(true); done(); };
      el.play().catch(() => { pendingSpeechRef.current = pcm; paramsRef.current.onError("Tap the orb to enable Bani’s audio."); setNeedsTap(true); done(); });
    });
  };

  /** Browser speech-synthesis fallback when TTS is unavailable. */
  const speakFallback = async (text: string): Promise<void> => {
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); playbackDoneRef.current = null; resolve(); };
      const timer = setTimeout(() => { window.speechSynthesis?.cancel(); paramsRef.current.onError("Browser audio stalled. Read the answer in chat or try again."); done(); }, 25000);
      try {
        const synth = window.speechSynthesis;
        if (!synth) { paramsRef.current.onError("Speech is unavailable on this browser. The answer remains in chat."); return done(); }
        const tag = speechLangTag(languageRef.current);
        const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
        utter.lang = tag;
        const match = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(tag.slice(0, 2)));
        if (match) utter.voice = match;
        utter.onend = done;
        utter.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") paramsRef.current.onError("Browser speech could not play. The answer remains in chat."); done(); };
        playbackDoneRef.current = done;
        synth.speak(utter);

      } catch {
        paramsRef.current.onError("Browser speech is unavailable. The answer remains in chat.");
        done();
      }
    });
  };

  /** Exactly three non-confidential clips per session; independent of turn cancellation. */
  const pregenAcks = async (_lang: string, _gen: number) => {
    if (!ACKS_ENABLED || ackLangsDoneRef.current.has("en")) return;
    ackLangsDoneRef.current.add("en");
    const { token } = paramsRef.current.getAuth();
    if (!token) return;
    const controller = new AbortController();
    warmAbortRef.current = controller;
    for (const text of ACKS.en) {
      if (controller.signal.aborted || !activeRef.current) return;
      const pcm = await fetchTtsPcm(text, token, generationRef.current, false, controller.signal);
      if (controller.signal.aborted || !activeRef.current) return;
      if (pcm) ackClipsRef.current.set(text, pcm);
    }
  };

  /** Barge-in: stop Bani and start a new listening turn from this moment. */
  const bargeIn = () => {
    bargePendingRef.current = true;
    generationRef.current++; // cancels in-flight send/summary continuations
    stopPlayback();
    abortRef.current?.abort();
    listen();
  };

  /** While Bani speaks, watch the mic for sustained loud speech (= interrupt). */
  const startBargeMonitor = (gen: number, turn: number) => {
    cancelAnimationFrame(bargeRafRef.current);
    let aboveSince: number | null = null;
    const tickBarge = () => {
      if (gen !== generationRef.current || turn !== turnRef.current || stateRef.current !== "speaking") return;
      const an = micAnalyserRef.current;
      if (an && !bargeDisabledRef.current && !mutedRef.current) {
        const rms = readLevel(an);
        const now = performance.now();
        // Stricter than the normal speech threshold: ~2x over the noise floor.
        const thr = Math.max(0.03, noiseFloorRef.current * 5);
        if (now - playbackStartedAtRef.current > BARGE_GUARD_MS && rms > thr) {
          if (aboveSince === null) aboveSince = now;
          else if (now - aboveSince >= BARGE_MS) { bargeIn(); return; }
        } else {
          aboveSince = null;
        }
      }
      bargeRafRef.current = requestAnimationFrame(tickBarge);
    };
    bargeRafRef.current = requestAnimationFrame(tickBarge);
  };

  /** Speak the 1–3 sentence summary: sentence 1 plays as soon as it's ready
   *  while the rest synthesise in parallel; all queue on the same <audio>. */
  const speakSummary = async (text: string, gen: number, turn: number): Promise<void> => {
    const { token } = paramsRef.current.getAuth();
    const sentences = splitSentences(text);
    if (!token || !sentences.length) return;
    playAbortRef.current = new AbortController();
    let earlyPlayback = Promise.resolve();
    let earlyChunks = 0;
    const jobs = sentences.map((s, index) => fetchTtsPcm(s, token, gen, true, undefined,
      index === 0 ? (pcm) => {
        earlyChunks++;
        earlyPlayback = earlyPlayback.then(async () => {
          if (gen !== generationRef.current || turn !== turnRef.current || pendingSpeechRef.current) return;
          startBargeMonitor(gen, turn);
          await playPcm(pcm, gen);
        });
      } : undefined));
    let prior = "";
    let played = 0;
    for (let i = 0; i < jobs.length; i++) {
      const pcm = await jobs[i];
      if (gen !== generationRef.current || turn !== turnRef.current || pendingSpeechRef.current) return;
      if (i === 0 && earlyChunks) {
        await earlyPlayback;
        played++;
        if (!pcm && gen === generationRef.current) paramsRef.current.onError("The spoken answer was interrupted. The complete answer is in chat.");
        if (gen !== generationRef.current || turn !== turnRef.current) return;
        continue;
      }
      if (!pcm || !pcm.length) {
        if (gen === generationRef.current) await speakFallback(sentences[i]);
        played++;
        continue;
      }
      const durationMs = (pcm.length / 2 / 24000) * 1000;
      setReveal({ prior, text: sentences[i], durationMs, id: ++revealIdRef.current });
      startBargeMonitor(gen, turn);
      await playPcm(pcm, gen);
      played++;
      prior = prior ? `${prior} ${sentences[i]}` : sentences[i];
    }
    if (!played && gen === generationRef.current && turn === turnRef.current) {
      setReveal({ prior: "", text, durationMs: Math.min(12000, text.length * 70), id: ++revealIdRef.current });
      await speakFallback(text);
    }
  };

  /** Speak a short server filler. Uses its own budget (never a summary slot)
   *  and re-checks right before playback that the lookup is still running. */
  const speakFiller = async (text: string, gen: number, turn: number): Promise<void> => {
    const { token } = paramsRef.current.getAuth();
    if (!token) return;
    const live = () => gen === generationRef.current && turn === turnRef.current
      && fillerStillWanted(stateRef.current, summaryTurnRef.current === turn);
    if (!live()) return;
    playAbortRef.current = new AbortController();
    fillerPlayingRef.current = true;
    try {
      const pcm = ackClipsRef.current.get(text);
      if (!live()) return;
      if (pcm) await playPcm(pcm, gen);
      else await speakFallback(text);
    } finally {
      fillerPlayingRef.current = false;
    }
  };

  /** Live words: Web Speech API in parallel with the recorder, display only. */
  const startLiveWords = (gen: number) => {
    // Mobile recognition opens its own microphone session. Keep one capture owner
    // on phones rather than relying on two independent browser capture engines.
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    try {
      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!Ctor) return;
      const rec = new Ctor();
      rec.interimResults = true;
      rec.continuous = true;
      rec.lang = navigator.language || "en-GB";
      rec.onresult = (e: any) => {
        if (gen !== generationRef.current) return;
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalTranscriptRef.current = (finalTranscriptRef.current + " " + t).trim();
          } else {
            interim += t;
          }
        }
        const shown = (finalTranscriptRef.current + " " + interim).trim();
        if (shown) { setUserWords(shown); setUserWordsLive(true); }
      };
      rec.onerror = () => { recogRef.current = null; }; // never break recording
      rec.onend = () => { if (recogRef.current === rec) recogRef.current = null; };
      rec.start();
      recogRef.current = rec;
    } catch { /* live words optional — recording continues */ }
  };

  /** Transcribe the recorded blob (or use the English fast path), then send. */
  const transcribeAndSend = async (blob: Blob | null, gen: number, typed?: string) => {
    const { token, tenantId } = paramsRef.current.getAuth();
    if (gen !== generationRef.current) return;
    if (!token || !tenantId) { paramsRef.current.onError("Voice needs an active workspace. Reopen Bani after signing in."); end(); return; }
    const stageController = new AbortController();
    stageAbortRef.current?.abort();
    stageAbortRef.current = stageController;
    const turn = ++turnRef.current;
    turnEndedAtRef.current = performance.now();
    const wasBarge = bargePendingRef.current;
    bargePendingRef.current = false;
    ttsCountRef.current = 0;
    setVoiceState(typed ? "thinking" : "transcribing");
    setStepLabel("");
    const noteEmpty = () => {
      if (wasBarge) {
        bargeMissesRef.current++;
        if (bargeMissesRef.current >= BARGE_MISS_LIMIT) bargeDisabledRef.current = true;
      }
      recover(EMPTY_NOTICE + ". Tap the orb to retry.");
    };
    try {
      // Fast path: a final Web Speech transcript in an English browser skips bani-stt.
      const liveFinal = typed ? "" : finalTranscriptRef.current.trim();
      const browserEn = (navigator.language || "en").toLowerCase().startsWith("en");
      let text = "";
      let lang = languageRef.current || "en";
      if (typed) {
        text = typed; // typed in voice mode: same turn path, spoken reply
      } else if (liveFinal.length > 2 && browserEn) {
        text = liveFinal;
        lang = "en";
      } else {
        if (!blob) return noteEmpty();
        const form = new FormData();
        form.append("file", new File([blob], "question.webm", { type: blob.type || "audio/webm" }));
        if (tenantId) form.append("tenant_id", tenantId);
        const data = await voiceDeadline((async () => {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bani-stt`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: form,
          signal: stageController.signal,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || "Transcription failed");
        return data;
        })(), 25000, stageController.signal, "Transcription timed out. Tap the orb to record again.", () => stageController.abort());
        text = String(data.text || "").trim();
        if (data.language) {
          lang = data.language;
          setLanguage(data.language);
          languageRef.current = data.language;
          // Acknowledgement cache is bounded to the entry language for this session.
        }
      }
      if (gen !== generationRef.current) return;
      if (!text) return noteEmpty();
      setUserWords(text); // server transcript replaces live words
      setUserWordsLive(false);
      setVoiceState("thinking");

      fillerUsedRef.current = { turn, first: false, more: false };

      const onSpeak = (s: SpeakEvent) => {
        if (gen !== generationRef.current || turn !== turnRef.current) return;
        if (s.kind === "summary") {
          // A summary replaces any still-queued/playing filler.
          clearTimers();
          pendingSpeechRef.current = null;
          summaryTurnRef.current = turn;
          // Let an acknowledgement already playing finish its sentence.
          const pendingFiller = fillerPlayingRef.current ? fillerPromiseRef.current : null;
          if (!pendingFiller) stopPlayback();
          void (pendingFiller ?? Promise.resolve()).catch(() => {}).then(() => {
          if (gen !== generationRef.current || turn !== turnRef.current) return;
          setVoiceState("speaking");
          setStepLabel("");
          return speakSummary(s.text, gen, turn).then(() => {
            if (gen !== generationRef.current || !activeRef.current) return;
            if (pendingSpeechRef.current) { setVoiceState("idle"); return; }
            setReveal(null);
            listen();
          });
          });
        } else {
          const used = fillerUsedRef.current;
          if (s.stage === "more") {
            if (used.more || fillerPlayingRef.current) return;
            used.more = true;
          } else {
            if (used.first) return;
            used.first = true;
          }
          const fp = speakFiller(s.text, gen, turn);
          fillerPromiseRef.current = fp;
          void fp;
        }
      };
      const onStatus = (label: string) => {
        if (gen !== generationRef.current || turn !== turnRef.current) return;
        if (summaryTurnRef.current === turn) return; // summary wins
        if (stateRef.current === "thinking") setStepLabel(label);
      };

      await voiceDeadline(paramsRef.current.sendQuestion(text, {
        voice: true,
        voiceLanguage: lang,
        onSpeak,
        onStatus,
      }), 60000, stageController.signal, "Bani’s reply timed out. Tap the orb to try again.", () => abortRef.current?.abort());
      // If the turn ended without a spoken summary, go back to listening.
      if (gen === generationRef.current && activeRef.current && summaryTurnRef.current !== turn) {
        stopPlayback();
        paramsRef.current.onError("No spoken reply arrived. Check the chat, then tap the orb to try again.");
        recover("No spoken reply arrived. Check the chat, then tap the orb to try again.");
      }
    } catch (e) {
      if (gen !== generationRef.current) return;
      const message = e instanceof Error ? e.message : "Voice failed. Tap the orb to try again.";
      paramsRef.current.onError(message);
      recover(message);
    }
  };

  /** Attach the analyser to the session stream (once). */
  const attachAnalyser = (stream: MediaStream) => {
    if (micAnalyserRef.current) return;
    try {
      if (!micCtxRef.current) micCtxRef.current = new AudioContext();
      const ctx = micCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
    } catch { /* level meter optional */ }
  };

  /** Get the session stream; getUserMedia is called at most once per session. */
  const getStream = (): Promise<MediaStream> => {
    if (streamRef.current) return Promise.resolve(streamRef.current);
    if (!streamPromiseRef.current) {
      const pending = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }).then((s) => {
        if (streamPromiseRef.current !== pending || !activeRef.current) { s.getTracks().forEach((t) => t.stop()); throw new DOMException("Canceled", "AbortError"); }
        streamRef.current = s;
        attachAnalyser(s);
        return s;
      });
      streamPromiseRef.current = pending;
    }
    return streamPromiseRef.current;
  };

  const recover = (message: string) => {
    generationRef.current++;
    stageAbortRef.current?.abort();
    abortRef.current?.abort();
    stopRecorder(true);
    stopLiveWords();
    stopPlayback();
    clearTimers();
    setVoiceState("idle");
    setNeedsTap(true);
    setNotice(message);
    setLevel(0);
  };

  /** Begin one listening turn: start a recorder on the session stream + silence detection. */
  const listen = (noticeText?: string) => {
    if (!activeRef.current) return;
    const gen = ++generationRef.current;
    stageAbortRef.current?.abort();
    stopPlayback();
    stopRecorder(true);
    stopLiveWords();
    clearTimers();
    setLevel(0);
    setReveal(null);
    setStepLabel("");
    setUserWords("");
    setUserWordsLive(false);
    finalTranscriptRef.current = "";

    const captureController = new AbortController();
    stageAbortRef.current = captureController;
    voiceDeadline(getStream(), 15000, captureController.signal, "Microphone did not open. Check Chrome permissions, then tap the orb to retry.").then((stream) => {
      if (gen !== generationRef.current || !activeRef.current) return;
      setTrackEnabled(!mutedRef.current);
      if (micCtxRef.current?.state === "suspended") micCtxRef.current.resume().catch(() => {});

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined) as MediaRecorder & { __discard?: boolean };
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        if (recorder.__discard) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (gen !== generationRef.current || !activeRef.current) return;
        clearTimers();
        if (!blob.size) { recover(EMPTY_NOTICE + ". Tap the orb to retry."); return; }
        void transcribeAndSend(blob, gen);
      };
      recorderRef.current = recorder;

      setVoiceState("listening");
      setNeedsTap(false);
      if (noticeText) {
        setNotice(noticeText);
        timersRef.current.push(setTimeout(() => {
          if (gen === generationRef.current && stateRef.current === "listening") setNotice("");
        }, NOTICE_MS));
      } else {
        setNotice("");
      }

      const detector = createSpeechDetector();
      let startedAt = Date.now(); // never depend on a browser delivering onstart
      recorder.onstart = () => {
        startLiveWords(gen);
      };
      recorder.onerror = () => { if (gen === generationRef.current) recover("Recording failed. Tap the orb to retry."); };
      recorder.start(250);

      const finishTurn = () => {
        cancelAnimationFrame(rafRef.current);
        setLevel(0);
        stopLiveWords();
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
        finishRecordingRef.current = null;
        setVoiceState("transcribing");
        turnEndedAtRef.current = performance.now();

        const rec = recorderRef.current;
        recorderRef.current = null;
        if (rec && rec.state !== "inactive") {
          timersRef.current.push(setTimeout(() => { if (gen === generationRef.current && stateRef.current === "transcribing") recover("Recording did not finish. Tap the orb to retry."); }, 2500));
          try { rec.stop(); } catch { recover("Recording could not finish. Tap the orb to retry."); }
        } else {
          recover("Recording stopped unexpectedly. Tap the orb to retry.");
        }
      };
      finishRecordingRef.current = finishTurn;

      const tick = () => {
        if (gen !== generationRef.current || recorderRef.current !== recorder) return; // superseded on purpose
        try {
          const now = Date.now();
          const an = micAnalyserRef.current;
          const rms = an && micCtxRef.current?.state === "running" ? readLevel(an) : 0;
          setLevelThrottled(Math.min(1, rms * 6));
          {
            if (mutedRef.current) { startedAt = now; return; }
            const res = detector.push(rms, now);
            noiseFloorRef.current = detector.floor;
            if (res === "end") return finishTurn();
            if (!detector.speechStarted && now - startedAt > NO_SPEECH_MS) {
              // A zero/suspended analyser is not proof that the recording is empty.
              // Submit the real bytes so quiet speech is decided by transcription.
              return finishTurn();
            }
            if (now - startedAt > MAX_TURN_MS) return finishTurn();
          }
        } catch (err) {
          // Safety net: never stop silently while voice is active and listening.
          if (gen === generationRef.current) finishTurn();
        }
      };
      // Wall-clock monitoring also runs when animation frames/context are suspended.
      captureTimerRef.current = setInterval(tick, 100);
    }).catch((error) => {
      if (gen !== generationRef.current) return;
      const blocked = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      const message = blocked ? "Microphone blocked. Allow microphone access in Chrome, then tap the orb to retry." : error?.message || "Microphone unavailable. Check browser permissions and tap the orb to retry.";
      streamPromiseRef.current = null;
      recover(message);
      paramsRef.current.onError(message);
    });
  };

  /**
   * Enter voice mode. Must be called directly from the user's tap: marks voice
   * active, unlocks audio and requests the mic synchronously (iOS).
   */
  const start = useCallback(() => {
    activeRef.current = true;
    generationRef.current++;
    clearTimers();
    stopPlayback();
    summaryTurnRef.current = -1;
    const gen = generationRef.current;
    try {
      // Unlock the session <audio> element inside the tap: play a silent clip so
      // iOS allows later play() calls, and so output uses the media channel
      // (audible even when the phone's silent switch is on).
      const el = ensureAudioEl();
      el.src = SILENT_WAV;
      el.play().then(() => { try { el.pause(); } catch { /* ignore */ } }).catch(() => {});
      if (!micCtxRef.current) micCtxRef.current = new AudioContext();
      micCtxRef.current.resume().catch(() => {});
    } catch { /* audio unlock best-effort */ }
    try {
      getStream().catch(() => {}); // getUserMedia inside the tap's call stack
    } catch { /* handled in listen */ }
    listen();
    // Pre-generate acknowledgements in the background so the first turn end
    // already has a zero-delay "Okay." ready.
    void pregenAcks(languageRef.current, gen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ↑ while listening: send the current recording immediately. */
  const sendNow = useCallback(() => {
    if (stateRef.current !== "listening") return;
    finishRecordingRef.current?.();
  }, []);

  /** Tap the orb: interrupt thinking/speaking back to listening; resume from idle. */
  const interrupt = useCallback(() => {
    const pending = pendingSpeechRef.current;
    if (pending) {
      pendingSpeechRef.current = null;
      setNeedsTap(false);
      setVoiceState("speaking");
      const gen = generationRef.current;
      void playPcm(pending, gen).then(() => { if (gen === generationRef.current && !pendingSpeechRef.current) listen(); });
      return;
    }
    const s = stateRef.current;
    if (s === "listening") {
      finishRecordingRef.current?.();
    } else if (s === "thinking" || s === "speaking" || s === "transcribing") {
      generationRef.current++; // cancels in-flight send continuations
      stopPlayback();
      abortRef.current?.abort();
      listen();
    } else if (s === "idle") {
      listen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Mute toggle: disables the mic track (and barge-in) until unmuted. */
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (streamRef.current && stateRef.current !== "idle") setTrackEnabled(!next);
  }, []);

  /** Register the in-flight chat request so interrupt can abort it. */
  const trackRequest = useCallback((controller: AbortController | null) => {
    abortRef.current = controller;
  }, []);

  /**
   * Typed question during voice mode. Discards any pending mic capture, stops
   * Bani's playback, then runs the normal voice turn (spoken reply, then listens
   * again). Refuses while a turn is still transcribing/thinking (no overlap).
   */
  const sendTyped = useCallback((raw: string): boolean => {
    const text = raw.trim();
    if (!activeRef.current || !text) return false;
    // Typed text preempts any pending capture, transcription or reply.
    generationRef.current++;
    abortRef.current?.abort();
    turnEndedAtRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(bargeRafRef.current);
    stopRecorder(true);
    stopLiveWords();
    stopPlayback();
    clearTimers();
    pendingSpeechRef.current = null;
    setNotice("");
    setNeedsTap(false);
    setLevel(0);
    setReveal(null);
    void transcribeAndSend(null, generationRef.current, text);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Real signal for the orb (0..1): mic RMS while listening, playback envelope while speaking. */
  const getLevel = useCallback((): number => {
    const s = stateRef.current;
    if (s === "listening") {
      const an = micAnalyserRef.current;
      if (!an || mutedRef.current) return 0;
      return micLevelFromRms(readLevel(an), noiseFloorRef.current);
    }
    if (s === "speaking") {
      const el = audioElRef.current;
      const env = envelopeRef.current;
      if (!el || !env || el.paused || el.ended) return 0;
      return envelopeAt(env, el.currentTime);
    }
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    getLevel,
    state, level, needsTap, muted, language,
    userWords, userWordsLive, stepLabel, reveal, notice,
    start, end, interrupt, sendNow, toggleMute, trackRequest, sendTyped,
  };
}
