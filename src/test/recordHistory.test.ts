import { describe, expect, it } from "vitest";
import { historyLine, historyTime } from "@/utils/recordHistory";

describe("record history lines", () => {
  it("shows Hong Kong time", () => {
    expect(historyTime("2026-11-28T08:52:00Z")).toBe("28 Nov 16:52");
  });
  it("reads what, when, who and skips an unknown person", () => {
    expect(historyLine({ at: "2026-11-28T08:50:00Z", text: "Approved", who: "Prashant" })).toBe("Approved · 28 Nov 16:50 · Prashant");
    expect(historyLine({ at: "2026-11-28T08:50:00Z", text: "Recorded" })).toBe("Recorded · 28 Nov 16:50");
  });
});
