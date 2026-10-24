import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDictation } from "@/hooks/useDictation";

class Recorder {
  static isTypeSupported() { return true; }
  static instances: Recorder[] = [];
  state = "inactive"; mimeType = "audio/webm";
  onstop: (() => void) | null = null; onerror: (() => void) | null = null;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = "recording"; }
  requestData() {}
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["final words"]) }); this.onstop?.(); }
}

describe("dictation recorder", () => {
  let track: { stop: ReturnType<typeof vi.fn> };
  let gum: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const recognition = vi.fn();
  beforeEach(() => {
    Recorder.instances = [];
    track = { stop: vi.fn() };
    gum = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    vi.stubGlobal("MediaRecorder", Recorder);
    vi.stubGlobal("AudioContext", class { state = "running"; close = vi.fn().mockResolvedValue(undefined); createMediaStreamSource = () => ({ connect: vi.fn() }); createAnalyser = () => ({ fftSize: 1024, getFloatTimeDomainData: (a: Float32Array) => a.fill(0) }); });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: gum } });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: recognition });
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ text: "how were sales" }) }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const mount = (onText = vi.fn(), onError = vi.fn()) =>
    ({ onText, onError, ...renderHook(() => useDictation({ getAuth: () => ({ token: "t", tenantId: "x" }), onError })) });

  it("confirm flushes the final audio, transcribes once and releases the mic", async () => {
    const { result, onText } = mount();
    await act(async () => result.current.start());
    expect(result.current.state).toBe("recording");
    await act(async () => result.current.confirm());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("how were sales");
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(recognition).not.toHaveBeenCalled(); // no competing recognizer
  });
  it("cancel discards audio, never transcribes and releases the mic", async () => {
    const { result, onText } = mount();
    await act(async () => result.current.start());
    act(() => result.current.cancel());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });
  it("double mic taps open one microphone only", async () => {
    const { result } = mount();
    await act(async () => { result.current.start(); result.current.start(); });
    expect(gum).toHaveBeenCalledTimes(1);
  });
  it("blocked permission shows an actionable message", async () => {
    gum.mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    const { result, onError } = mount();
    await act(async () => result.current.start());
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Microphone is blocked"));
    expect(result.current.state).toBe("idle");
  });
  it("no speech gives a retry notice instead of empty text", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ text: "" }) }));
    const { result, onText, onError } = mount();
    await act(async () => result.current.start());
    let text: string | null = "x";
    await act(async () => { text = await result.current.confirm(); });
    expect(text).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Didn't catch"));
  });
});
