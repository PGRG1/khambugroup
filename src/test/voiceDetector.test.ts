import { describe, it, expect } from "vitest";
import { createSpeechDetector, splitSentences, SILENCE_MS, SPEECH_START_MS } from "@/hooks/useVoiceConversation";

const run = (frames: [number, number][]) => {
  const d = createSpeechDetector();
  return frames.map(([rms, t]) => d.push(rms, t));
};

describe("voice speech detector", () => {
  it("needs ~250ms above threshold before speech counts", () => {
    const d = createSpeechDetector();
    expect(d.push(0.2, 0)).toBe("none");
    expect(d.push(0.2, SPEECH_START_MS - 10)).toBe("none");
    expect(d.push(0.2, SPEECH_START_MS)).toBe("speech");
  });

  it("ignores a short blip", () => {
    const out = run([[0.2, 0], [0.2, 100], [0.001, 150], [0.001, 3000]]);
    expect(out).not.toContain("speech");
    expect(out).not.toContain("end");
  });

  it("ends the turn after ~700ms of quiet once speech started", () => {
    const d = createSpeechDetector();
    d.push(0.2, 0); d.push(0.2, 300);
    expect(d.push(0.001, 300 + SILENCE_MS - 50)).toBe("none");
    expect(d.push(0.001, 300 + SILENCE_MS + 50)).toBe("end");
  });

  it("noise floor adapts from quiet frames", () => {
    const d = createSpeechDetector();
    const before = d.threshold;
    for (let i = 0; i < 200; i++) d.push(0.01, i * 16);
    expect(d.threshold).toBeGreaterThan(before);
  });
});
