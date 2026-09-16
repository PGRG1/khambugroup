import { describe, it, expect } from "vitest";
import { matchVenueName, shouldAutoProcessInitialFile } from "@/utils/venueMatch";

const master = ["Assembly", "Caliente", "Hanabi"];
const fakeFile = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("matchVenueName", () => {
  it("maps a lowercase scanned value to the canonical master venue", () => {
    expect(matchVenueName("caliente", master)).toBe("Caliente");
  });

  it("trims surrounding whitespace", () => {
    expect(matchVenueName("  HANABI \n", master)).toBe("Hanabi");
  });

  it("returns blank for a genuinely unknown venue so the user must select", () => {
    expect(matchVenueName("Calienté Bar", master)).toBe("");
    expect(matchVenueName("", master)).toBe("");
  });

  it("returns blank when the venue master has not loaded yet", () => {
    expect(matchVenueName("caliente", [])).toBe("");
  });
});

describe("shouldAutoProcessInitialFile", () => {
  it("waits while venues are still loading", () => {
    const f = fakeFile("receipt.pdf");
    expect(shouldAutoProcessInitialFile({ initialFile: f, venuesLoading: true, alreadyStarted: null })).toBe(false);
  });

  it("processes once venues have loaded", () => {
    const f = fakeFile("receipt.pdf");
    expect(shouldAutoProcessInitialFile({ initialFile: f, venuesLoading: false, alreadyStarted: null })).toBe(true);
  });

  it("does not process the same file twice", () => {
    const f = fakeFile("receipt.pdf");
    expect(shouldAutoProcessInitialFile({ initialFile: f, venuesLoading: false, alreadyStarted: f })).toBe(false);
  });

  it("processes a different file even after an earlier one", () => {
    const a = fakeFile("a.pdf");
    const b = fakeFile("b.pdf");
    expect(shouldAutoProcessInitialFile({ initialFile: b, venuesLoading: false, alreadyStarted: a })).toBe(true);
  });

  it("does nothing without a file", () => {
    expect(shouldAutoProcessInitialFile({ initialFile: null, venuesLoading: false, alreadyStarted: null })).toBe(false);
  });
});
