import { describe, expect, it } from "vitest";
import { releaseTarget, springStep } from "@/components/assistant/VoiceStage";

describe("voice collapse gesture", () => {
  it("short drag springs back, past halfway collapses", () => {
    expect(releaseTarget(0.3, 0)).toBe(0);
    expect(releaseTarget(0.6, 0)).toBe(1);
  });
  it("a downward flick collapses even when short; upward flick expands", () => {
    expect(releaseTarget(0.2, 2)).toBe(1);
    expect(releaseTarget(0.8, -2)).toBe(0);
  });
  it("spring settles on target without overshooting", () => {
    let s = { p: 0.3, v: 0 }, max = 0;
    for (let i = 0; i < 120; i++) { s = springStep(s.p, s.v, 1, 1 / 60); max = Math.max(max, s.p); }
    expect(s.p).toBeCloseTo(1, 2);
    expect(max).toBeLessThan(1.01);
  });
});
