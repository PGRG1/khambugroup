import { describe, expect, it } from "vitest";
import { decideFiller, fillerStillWanted, FIRST_FILLER_MIN_MS } from "./voiceFiller";

const base = {
  stage: "first" as const, state: "thinking", summaryArrived: false,
  firstUsed: false, moreUsed: false, fillerPlaying: false, sinceTurnEndMs: 0,
};

describe("voice filler rules", () => {
  it("delays the first filler so fast answers get none", () => {
    expect(decideFiller({ ...base, sinceTurnEndMs: 400 })).toEqual({ play: true, delayMs: FIRST_FILLER_MIN_MS - 400 });
  });
  it("allows only one initial acknowledgement per turn", () => {
    expect(decideFiller({ ...base, firstUsed: true })).toEqual({ play: false });
  });
  it("allows only one delayed update per turn", () => {
    expect(decideFiller({ ...base, stage: "more" })).toEqual({ play: true, delayMs: 0 });
    expect(decideFiller({ ...base, stage: "more", moreUsed: true })).toEqual({ play: false });
  });
  it("never overlaps a filler that is already playing", () => {
    expect(decideFiller({ ...base, stage: "more", fillerPlaying: true })).toEqual({ play: false });
  });
  it("never speaks once the answer has arrived or the turn moved on", () => {
    expect(decideFiller({ ...base, summaryArrived: true })).toEqual({ play: false });
    expect(decideFiller({ ...base, stage: "more", state: "speaking" })).toEqual({ play: false });
    expect(decideFiller({ ...base, state: "listening" })).toEqual({ play: false });
    expect(fillerStillWanted("thinking", true)).toBe(false);
    expect(fillerStillWanted("idle", false)).toBe(false);
    expect(fillerStillWanted("thinking", false)).toBe(true);
  });
});
