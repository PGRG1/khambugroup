// Two-way voice conversation loop for Bani AI.
// listening → transcribing → thinking (spoken filler) → speaking (spoken summary) → listening.
// Uses getUserMedia + MediaRecorder, the bani-stt and bani-tts edge functions, and
// the normal chat send() path with voice flags. The browser Web Speech API runs in
// parallel ONLY to show live words (and as an English fast path) — it never replaces
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

/** 24 kHz mono WAV with a single silent sample — used to unlock the <audio> element on the entry tap. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAA";

/**
 * Adaptive speech detector (pure, unit-tested). Feed RMS frames with timestamps.
 * The noise floor follows quiet frames (slow moving average); speech starts after
 * SPEECH_START_MS above threshold; the turn ends after SILENCE_MS of quiet.
 */
export function createSpeechDetector(initialFloor = 0.005) {
  let floor = initialFloor;
  let aboveSince: number | null = null;
  let speechStarted = false;
  let lastLoudAt = 0;
  const threshold = () => Math.max(0.012, floor * 2.5);
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
  const ackLangsDoneRef = useRef<Set<string>>(new Set());

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
    const el = audioElRef.current;
    if (el) { try { el.pause(); } catch { /* ignore */ } }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  };

  /** Stop the current recorder. discard=true drops the audio. */
  const stopRecorder = (discard: boolean) => {
    cancelAnimationFrame(rafRef.current);
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
    stopLiveWords();
    abortRef.current?.abort();
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
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bani-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text: text.slice(0, 600) }),
        signal: signal ?? playAbortRef.current?.signal,
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
    el.src = url;
    playbackStartedAtRef.current = performance.now();
    await new Promise<void>((resolve) => {
      const done = () => {
        playbackDoneRef.current = null;
        el.onended = null; el.onerror = null;
        if (audioUrlRef.current === url) { URL.revokeObjectURL(url); audioUrlRef.current = null; }
        resolve();
      };
      playbackDoneRef.current = done;
      el.onended = done;
      el.onerror = () => { paramsRef.current.onError("Audio could not play. Tap the orb to try again."); setNeedsTap(true); done(); };
      el.play().catch(() => { paramsRef.current.onError("Tap the orb to enable Bani’s audio."); setNeedsTap(true); done(); });
    });
  };

  /** Browser speech-synthesis fallback when TTS is unavailable. */
  const speakFallback = async (text: string): Promise<void> => {
    await new Promise<void>((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) { paramsRef.current.onError("Speech is unavailable on this browser. The answer remains in chat."); return resolve(); }
        const tag = speechLangTag(languageRef.current);
        const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
        utter.lang = tag;
        const match = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(tag.slice(0, 2)));
        if (match) utter.voice = match;
        utter.onend = () => { playbackDoneRef.current = null; resolve(); };
        utter.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") paramsRef.current.onError("Browser speech could not play. The answer remains in chat."); resolve(); };
        playbackDoneRef.current = resolve;
        synth.speak(utter);

      } catch {
        paramsRef.current.onError("Browser speech is unavailable. The answer remains in chat.");
        resolve();
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
    const sentences = splitSentences(text).slice(0, 3);
    if (!token || !sentences.length) return;
    playAbortRef.current = new AbortController();
    let earlyPlayback = Promise.resolve();
    let earlyChunks = 0;
    const jobs = sentences.map((s, index) => fetchTtsPcm(s, token, gen, true, undefined,
      index === 0 ? (pcm) => {
        earlyChunks++;
        earlyPlayback = earlyPlayback.then(async () => {
          if (gen !== generationRef.current || turn !== turnRef.current) return;
          startBargeMonitor(gen, turn);
          await playPcm(pcm, gen);
        });
      } : undefined));
    let prior = "";
    let played = 0;
    for (let i = 0; i < jobs.length; i++) {
      const pcm = await jobs[i];
      if (gen !== generationRef.current || turn !== turnRef.current) return;
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
    if (!token || gen !== generationRef.current) return;
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
      listen(EMPTY_NOTICE);
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
          stopPlayback();
          summaryTurnRef.current = turn;
          setVoiceState("speaking");
          setStepLabel("");
          void speakSummary(s.text, gen, turn).then(() => {
            if (gen !== generationRef.current || !activeRef.current) return;
            setReveal(null);
            listen();
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
          void speakFiller(s.text, gen, turn);
        }
      };
      const onStatus = (label: string) => {
        if (gen !== generationRef.current || turn !== turnRef.current) return;
        if (summaryTurnRef.current === turn) return; // summary wins
        if (stateRef.current === "thinking") setStepLabel(label);
      };

      await paramsRef.current.sendQuestion(text, {
        voice: true,
        voiceLanguage: lang,
        onSpeak,
        onStatus,
      });
      // If the turn ended without a spoken summary, go back to listening.
      if (gen === generationRef.current && activeRef.current && summaryTurnRef.current !== turn) {
        stopPlayback();
        listen();
      }
    } catch (e) {
      if (gen !== generationRef.current) return;
      paramsRef.current.onError(e instanceof Error ? e.message : "Voice error");
      listen();
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
      streamPromiseRef.current = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }).then((s) => {
        streamRef.current = s;
        attachAnalyser(s);
        return s;
      });
    }
    return streamPromiseRef.current;
  };

  /** Begin one listening turn: start a recorder on the session stream + silence detection. */
  const listen = (noticeText?: string) => {
    if (!activeRef.current) return;
    const gen = generationRef.current;
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

    getStream().then((stream) => {
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
        if (blob.size < 800) { listen(EMPTY_NOTICE); return; } // nothing meaningful recorded
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
      let startedAt = 0; // set when the recorder has actually started
      recorder.onstart = () => {
        startedAt = performance.now();
        startLiveWords(gen);
      };
      recorder.start(250);

      const finishTurn = () => {
        cancelAnimationFrame(rafRef.current);
        setLevel(0);
        stopLiveWords();
        turnEndedAtRef.current = performance.now();

        const rec = recorderRef.current;
        recorderRef.current = null;
        if (rec && rec.state !== "inactive") {
          try { rec.stop(); } catch { listen(); }
        } else {
          listen();
        }
      };

      const tick = () => {
        if (gen !== generationRef.current || recorderRef.current !== recorder) return; // superseded on purpose
        try {
          const now = performance.now();
          const an = micAnalyserRef.current;
          const rms = an ? readLevel(an) : 0;
          setLevelThrottled(Math.min(1, rms * 6));
          if (startedAt) {
            const res = detector.push(rms, now);
            noiseFloorRef.current = detector.floor;
            if (res === "end") return finishTurn();
            if (!detector.speechStarted && now - startedAt > NO_SPEECH_MS) {
              stopRecorder(true);
              stopLiveWords();
              setTrackEnabled(false);
              setVoiceState("idle");
              setNeedsTap(true);
              setNotice("Tap the orb to talk");
              setLevel(0);
              return;
            }
            if (now - startedAt > MAX_TURN_MS) return finishTurn();
          }
          rafRef.current = requestAnimationFrame(tick);
        } catch (err) {
          // Safety net: never stop silently while voice is active and listening.
          console.warn("[voice] silence detector stopped unexpectedly; restarting", err);
          if (activeRef.current && stateRef.current === "listening" && gen === generationRef.current) listen();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {
      if (gen !== generationRef.current) return;
      paramsRef.current.onError("Microphone unavailable. Check your browser permissions.");
      end();
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
    cancelAnimationFrame(rafRef.current);
    stopLiveWords();
    turnEndedAtRef.current = performance.now();

    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* onstop handles the rest */ }
    }
  }, []);

  /** Tap the orb: interrupt thinking/speaking back to listening; resume from idle. */
  const interrupt = useCallback(() => {
    const s = stateRef.current;
    if (s === "thinking" || s === "speaking" || s === "transcribing") {
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
    const s = stateRef.current;
    if (s === "transcribing" || s === "thinking") return false;
    generationRef.current++;
    abortRef.current?.abort();
    turnEndedAtRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(bargeRafRef.current);
    stopRecorder(true);
    stopLiveWords();
    stopPlayback();
    clearTimers();
    setNotice("");
    setNeedsTap(false);
    setLevel(0);
    setReveal(null);
    void transcribeAndSend(null, generationRef.current, text);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state, level, needsTap, muted, language,
    userWords, userWordsLive, stepLabel, reveal, notice,
    start, end, interrupt, sendNow, toggleMute, trackRequest, sendTyped,
  };
}
