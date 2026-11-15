import { describe, expect, it } from "vitest";
import { buttonLabel } from "@/utils/periodWindow";

const today = "2026-11-16";
describe("period button wording", () => {
  it("keeps custom ranges short, with the year only when it isn't this year", () => {
    expect(buttonLabel({ from: "2026-11-03", to: "2026-11-14", key: "custom" }, "period", today)).toBe("3–14 Nov");
    expect(buttonLabel({ from: "2026-10-28", to: "2026-11-14", key: "custom" }, "period", today)).toBe("28 Oct – 14 Nov");
    expect(buttonLabel({ from: "2025-12-28", to: "2026-01-03", key: "custom" }, "period", today)).toBe("28 Dec 2025 – 3 Jan");
    expect(buttonLabel({ from: "2025-03-01", to: "2025-03-09", key: "custom" }, "period", today)).toBe("1–9 Mar 2025");
    expect(buttonLabel({ from: "2026-11-03", to: "2026-11-03", key: "custom" }, "period", today)).toBe("3 Nov");
  });
  it("leaves shortcuts in their own words", () => {
    expect(buttonLabel({ from: "2026-11-01", to: today, key: "mtd" }, "period", today)).toBe("Nov so far");
    expect(buttonLabel({ from: "2025-11-01", to: "2026-10-31", key: "last-12" }, "period", today)).toBe("Last 12 months");
  });
  it("shows an as-at date short", () => {
    expect(buttonLabel({ from: "2026-10-31", to: "2026-10-31", key: "last-month-end" }, "asat", today)).toBe("31 Oct");
  });
});
