import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceConversation, voiceDeadline } from "@/hooks/useVoiceConversation";

class Recorder {
  static isTypeSupported() { return true; }
  static instances: Recorder[] = [];
  state = "inactive";
  mimeType = "audio/webm";
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = "recording"; } // deliberately missing onstart
  stop() {
    this.state = "inactive";
    // Final bytes arrive only on stop: a tiny recording must still reach STT.
    this.ondataavailable?.({ data: new Blob(["quiet recorded audio"]) });
    this.onstop?.();
  }
}

describe("voice capture recovery", () => {
  let errors: ReturnType<typeof vi.fn>;
  let send: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let stream: { getTracks: () => { stop: ReturnType<typeof vi.fn>; enabled: boolean }[]; getAudioTracks: () => { stop: ReturnType<typeof vi.fn>; enabled: boolean }[] };
  beforeEach(() => {
    vi.useFakeTimers();
    Recorder.instances = [];
    errors = vi.fn(); send = vi.fn().mockResolvedValue(undefined);
    const track = { stop: vi.fn(), enabled: true };
    stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    vi.stubGlobal("MediaRecorder", Recorder);
    vi.stubGlobal("Audio", class { play = vi.fn().mockResolvedValue(undefined); pause = vi.fn(); });
    vi.stubGlobal("AudioContext", class {
      state = "suspended";
      resume = vi.fn().mockResolvedValue(undefined); // remains suspended
      close = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource = () => ({ connect: vi.fn() });
      createAnalyser = () => ({ fftSize: 512, getFloatTimeDomainData: (a: Float32Array) => a.fill(0) });
    });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Android Chrome" });
    fetchMock = vi.fn(async (url: string) => url.includes("bani-stt")
      ? { ok: true, json: async () => ({ text: "How were sales at Assembly?", language: "en" }) }
      : { ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const mount = () => renderHook(() => useVoiceConversation({ active: true, getAuth: () => ({ token: "test", tenantId: "tenant" }), sendQuestion: send, onError: errors }));
  it("submits final recorder bytes despite suspended analyser and missing onstart, within 8 seconds", async () => {
    const { result, unmount } = mount();
    await act(async () => result.current.start());
    expect(result.current.state).toBe("listening");
    await act(async () => vi.advanceTimersByTimeAsync(8200));
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("bani-stt"))).toHaveLength(1);
    expect(send).toHaveBeenCalledWith("How were sales at Assembly?", expect.objectContaining({ voice: true }));
    expect(result.current.needsTap).toBe(true); // no summary: actionable, not silent looping
    expect(result.current.notice).toContain("No spoken reply");
    unmount();
  });
  it("orb tap explicitly flushes and sends without live recognition", async () => {
    const recognition = vi.fn();
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: recognition });
    const { result, unmount } = mount();
    await act(async () => result.current.start());
    await act(async () => result.current.interrupt());
    expect(recognition).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(Recorder.instances[0].state).toBe("inactive");
    unmount();
  });
  it("times out hung STT with a visible retry notice", async () => {
    fetchMock.mockImplementation((url: string) => url.includes("bani-stt") ? new Promise(() => {}) : Promise.resolve({ ok: false, json: async () => ({}) }));
    const { result, unmount } = mount();
    await act(async () => result.current.start());
    await act(async () => result.current.sendNow());
    await act(async () => vi.advanceTimersByTimeAsync(25100));
    expect(result.current.state).toBe("idle");
    expect(result.current.notice).toContain("Transcription timed out");
    expect(send).not.toHaveBeenCalled();
    unmount();
  });
  it("stops late permission streams after end instead of attaching them", async () => {
    let resolveStream: ((s: typeof stream) => void) | undefined;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise<typeof stream>((resolve) => { resolveStream = resolve; })) } });
    const { result, unmount } = mount();
    await act(async () => result.current.start());
    act(() => result.current.end());
    await act(async () => resolveStream?.(stream));
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(Recorder.instances).toHaveLength(0);
    unmount();
  });
  it("cancels pending stage immediately on abort", async () => {
    const controller = new AbortController();
    const pending = voiceDeadline(new Promise(() => {}), 1000, controller.signal, "timeout");
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});