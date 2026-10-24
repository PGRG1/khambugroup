// Two-way voice conversation loop for Bani AI.
// listening → transcribing → thinking (spoken filler) → speaking (spoken summary) → listening.
// Uses getUserMedia + MediaRecorder (never the Web Speech API), the bani-stt and
// bani-tts edge functions, and the normal chat send() path with voice flags.
//
// Phone-safety rules:
// - start() must be called directly from a tap. It marks voice active, unlocks
//   both AudioContexts and calls getUserMedia synchronously (no await first).
// - One mic stream per voice session; only the MediaRecorder starts/stops per
//   turn. The track is disabled while Bani speaks and released only in end().
// - stateRef is written synchronously via setVoiceState so async callbacks never
//   read a stale state.
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

export const SILENCE_MS = 1200;
export const SPEECH_START_MS = 250;
const MAX_TURN_MS = 30000;
const NO_SPEECH_MS = 8000;
const NOTICE_MS = 2000;
export const EMPTY_NOTICE = "Didn't catch that — try again";

const LANG_TAGS: Record<string, string> = {
  en: "en", zh: "zh-HK", yue: "zh-HK", ne: "ne", hi: "hi", tl: "tl", fil: "tl", id: "id",
};

function speechLangTag(lang: string): string {
  const l = (lang || "en").toLowerCase();
  for (const k of Object.keys(LANG_TAGS)) if (l.startsWith(k)) return LANG_TAGS[k];
  return "en";
}

/** Wrap 24 kHz signed 16-bit LE mono PCM bytes in a WAV header for <audio> playback. */
function pcmToWav(pcm: Uint8Array): Blob {
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

export function useVoiceConversation({ active, getAuth, sendQuestion, onError }: Params) {
  const [state, setState] = useState<VoiceState>("idle");
  const [caption, setCaption] = useState("");
  const [language, setLanguage] = useState("en");
  const [needsTap, setNeedsTap] = useState(false);
  const [level, setLevel] = useState(0);

  const stateRef = useRef<VoiceState>("idle");
  const setVoiceState = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };
  const activeRef = useRef(false);
  const languageRef = useRef("en");
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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const playAbortRef = useRef<AbortController | null>(null);
  const lastLevelSetRef = useRef(0);
  const ttsCountRef = useRef(0);
  const turnRef = useRef(0); // id of the current question turn
  const summaryTurnRef = useRef(-1); // turn whose summary has arrived
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

  const setTrackEnabled = (on: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = on; });
  };

  const stopPlayback = () => {
    playAbortRef.current?.abort();
    playAbortRef.current = null;
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

  /** Full cleanup — voice mode ends. Only place the mic tracks are released. */
  const end = useCallback(() => {
    activeRef.current = false;
    generationRef.current++;
    clearTimers();
    stopPlayback();
    stopRecorder(true);
    abortRef.current?.abort();
    abortRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    streamPromiseRef.current = null;
    micAnalyserRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    audioElRef.current = null;
    stateRef.current = "idle";
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
      if (!document.hidden) return;
      stopPlayback();
      if (stateRef.current === "listening") {
        stopRecorder(true);
        setTrackEnabled(false);
        setVoiceState("idle");
        setNeedsTap(true);
        setCaption("Tap the orb to talk");
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

  /** Play text through bani-tts (PCM SSE → WAV blob in an <audio> element). */
  const speak = async (text: string, gen: number): Promise<void> => {
    const { token } = paramsRef.current.getAuth();
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

      // Collect the whole PCM stream, then play it as one WAV clip. Clips are
      // 1–3 sentences, so buffering adds ~1s but plays reliably on phones.
      const chunks: Uint8Array[] = [];
      let total = 0;
      let completed = false;
      const parser = (data: string) => {
        const ev = JSON.parse(data);
        if (ev.type === "error" || ev.error) throw new Error("speech stream error");
        if (ev.type === "speech.audio.done") { completed = true; return; }
        if (ev.type !== "speech.audio.delta" || !ev.audio) return;
        const bytes = Uint8Array.from(atob(ev.audio), (c) => c.charCodeAt(0));
        chunks.push(bytes);
        total += bytes.length;
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
      if (!completed || !total) throw new Error("incomplete speech");
      if (gen !== generationRef.current) return;

      const pcm = new Uint8Array(total - (total % 2));
      let off = 0;
      for (const c of chunks) { pcm.set(c.subarray(0, Math.min(c.length, pcm.length - off)), off); off += c.length; }
      const url = URL.createObjectURL(pcmToWav(pcm));
      audioUrlRef.current = url;
      const el = ensureAudioEl();
      el.src = url;
      await new Promise<void>((resolve) => {
        const done = () => {
          el.onended = null; el.onerror = null;
          if (audioUrlRef.current === url) { URL.revokeObjectURL(url); audioUrlRef.current = null; }
          resolve();
        };
        el.onended = done;
        el.onerror = done;
        el.play().then(() => {}).catch(done);
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || gen !== generationRef.current) return;
      // Fallback: browser speech synthesis with a matching-language voice.
      await new Promise<void>((resolve) => {
        try {
          const synth = window.speechSynthesis;
          if (!synth) return resolve();
          const tag = speechLangTag(languageRef.current);
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
    }
  };

  /** Transcribe the recorded blob, then send it through the normal chat path. */
  const transcribeAndSend = async (blob: Blob, gen: number) => {
    const { token, tenantId } = paramsRef.current.getAuth();
    if (!token || gen !== generationRef.current) return;
    const turn = ++turnRef.current;
    ttsCountRef.current = 0;
    setVoiceState("transcribing");
    setCaption("Transcribing…");
    setTrackEnabled(false);
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
      if (data.language) { setLanguage(data.language); languageRef.current = data.language; }
      if (gen !== generationRef.current) return;
      if (!text) {
        listen(EMPTY_NOTICE);
        return;
      }
      setCaption(text);
      setVoiceState("thinking");

      const onSpeak = (s: SpeakEvent) => {
        if (gen !== generationRef.current || turn !== turnRef.current) return;
        if (s.kind === "summary") {
          // A summary replaces any still-queued/playing filler.
          stopPlayback();
          summaryTurnRef.current = turn;
          setVoiceState("speaking");
          setCaption(s.text);
          void speak(s.text, gen).then(() => {
            if (gen !== generationRef.current || !activeRef.current) return;
            listen();
          });
        } else if (summaryTurnRef.current !== turn) {
          void speak(s.text, gen);
        }
      };
      const onStatus = (label: string) => {
        if (gen !== generationRef.current || turn !== turnRef.current) return;
        if (summaryTurnRef.current === turn) return; // summary caption wins
        if (stateRef.current === "thinking") setCaption(label);
      };

      await paramsRef.current.sendQuestion(text, {
        voice: true,
        voiceLanguage: data.language || languageRef.current || "en",
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
      streamPromiseRef.current = navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
        streamRef.current = s;
        attachAnalyser(s);
        return s;
      });
    }
    return streamPromiseRef.current;
  };

  /** Begin one listening turn: start a recorder on the session stream + silence detection. */
  const listen = (notice?: string) => {
    if (!activeRef.current) return;
    const gen = generationRef.current;
    stopPlayback();
    stopRecorder(true);
    clearTimers();
    setLevel(0);

    getStream().then((stream) => {
      if (gen !== generationRef.current || !activeRef.current) return;
      setTrackEnabled(true);
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
      if (notice) {
        setCaption(notice);
        timersRef.current.push(setTimeout(() => {
          if (gen === generationRef.current && stateRef.current === "listening") setCaption("Listening…");
        }, NOTICE_MS));
      } else {
        setCaption("Listening…");
      }

      const detector = createSpeechDetector();
      let startedAt = 0; // set when the recorder has actually started
      recorder.onstart = () => { startedAt = performance.now(); };
      recorder.start(250);

      const finishTurn = () => {
        cancelAnimationFrame(rafRef.current);
        setLevel(0);
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
            if (detector.push(rms, now) === "end") return finishTurn();
            if (!detector.speechStarted && now - startedAt > NO_SPEECH_MS) {
              stopRecorder(true);
              setTrackEnabled(false);
              setVoiceState("idle");
              setNeedsTap(true);
              setCaption("Tap the orb to talk");
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
    try {
      ensurePlayCtx().resume().catch(() => {});
      if (!micCtxRef.current) micCtxRef.current = new AudioContext();
      micCtxRef.current.resume().catch(() => {});
    } catch { /* audio unlock best-effort */ }
    try {
      getStream().catch(() => {}); // getUserMedia inside the tap's call stack
    } catch { /* handled in listen */ }
    listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ↑ while listening: send the current recording immediately. */
  const sendNow = useCallback(() => {
    if (stateRef.current !== "listening") return;
    cancelAnimationFrame(rafRef.current);
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
      playCtxRef.current?.resume().catch(() => {});
      listen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Register the in-flight chat request so interrupt can abort it. */
  const trackRequest = useCallback((controller: AbortController | null) => {
    abortRef.current = controller;
  }, []);

  return { state, caption, level, needsTap, language, start, end, interrupt, sendNow, trackRequest, setCaption };
}
