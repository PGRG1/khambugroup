import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { pcmEnvelope, envelopeAt, micLevelFromRms } from "@/hooks/useVoiceConversation";
import { joinDraft } from "@/hooks/useDictation";
import { BaniOrb, BANI_MARK_PATHS, followLevel } from "@/components/assistant/BaniOrb";

const pcm = (samples: number[]) => {
  const b = new Uint8Array(samples.length * 2);
  const v = new DataView(b.buffer);
  samples.forEach((s, i) => v.setInt16(i * 2, s, true));
  return b;
};

describe("orb and waveform signals", () => {
  it("playback envelope is zero on silent PCM and past the end of the clip", () => {
    const env = pcmEnvelope(pcm(new Array(4800).fill(0))); // 0.2s silence
    expect(Array.from(env).every((v) => v === 0)).toBe(true);
    expect(envelopeAt(env, 5)).toBe(0);
  });
  it("playback envelope rises where the voice is loud", () => {
    const loud = Array.from({ length: 480 }, (_, i) => (i % 2 ? 8000 : -8000));
    const env = pcmEnvelope(pcm([...new Array(480).fill(0), ...loud]));
    expect(envelopeAt(env, 0)).toBe(0);
    expect(envelopeAt(env, 0.025)).toBeGreaterThan(0.5);
  });
  it("mic level stays 0 at the noise floor and grows with sound", () => {
    expect(micLevelFromRms(0.001)).toBe(0);
    expect(micLevelFromRms(0.08)).toBeGreaterThan(0.5);
  });
  it("orb settles to exactly 0 after sound stops", () => {
    let l = followLevel(0, 1);
    for (let i = 0; i < 80; i++) l = followLevel(l, 0);
    expect(l).toBe(0);
  });
  it("orb uses the official five-triangle Bani mark", () => {
    const { getByTestId } = render(<BaniOrb size={96} mode="idle" />);
    const svg = getByTestId("bani-orb-mark");
    expect(svg.getAttribute("viewBox")).toBe("0 0 320 600");
    expect(Array.from(svg.querySelectorAll("path")).map((p) => p.getAttribute("d"))).toEqual([
      "M0 0 L160 100 L0 200 Z", "M160 100 L320 200 L160 300 Z", "M0 200 L160 300 L0 400 Z",
      "M160 300 L320 400 L160 500 Z", "M0 400 L160 500 L0 600 Z",
    ]);
    expect(svg.querySelectorAll("polygon, line")).toHaveLength(0);
    expect(BANI_MARK_PATHS).toHaveLength(5);
  });
});

describe("dictation draft", () => {
  it("keeps existing text and appends dictated words", () => {
    expect(joinDraft("Sales at Assembly", "last week please")).toBe("Sales at Assembly last week please");
  });
  it("empty dictation leaves the draft unchanged", () => {
    expect(joinDraft("My draft ", "  ")).toBe("My draft ");
  });
});
