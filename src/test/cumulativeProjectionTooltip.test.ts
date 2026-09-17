import { describe, expect, it } from "vitest";
import { filterProjectionTooltipEntries } from "@/components/dashboard/CumulativeSalesChart";

const payload = (keys: string[]) => keys.map((dataKey) => ({ dataKey, value: 1000 }));

describe("filterProjectionTooltipEntries (current-month projection tooltip rule)", () => {
  const projectionStartDay = 16;

  it("hides the projection entry on the anchor/actual day", () => {
    const visible = filterProjectionTooltipEntries(
      payload(["2026-09", "2026-09_proj"]),
      16,
      projectionStartDay
    );
    expect(visible.map((e) => e.dataKey)).toEqual(["2026-09"]);
  });

  it("shows the projection entry only after the anchor day", () => {
    const visible = filterProjectionTooltipEntries(
      payload(["2026-09", "2026-09_proj"]),
      17,
      projectionStartDay
    );
    expect(visible.map((e) => e.dataKey)).toEqual(["2026-09_proj"]);
  });

  it("keeps historical month entries on any day", () => {
    const historical = payload(["2026-08", "2026-07"]);
    expect(filterProjectionTooltipEntries(historical, 16, projectionStartDay)).toEqual(historical);
    expect(filterProjectionTooltipEntries(historical, 17, projectionStartDay)).toEqual(historical);
  });

  it("handles string day labels from the axis", () => {
    expect(
      filterProjectionTooltipEntries(payload(["2026-09_proj"]), "16", projectionStartDay)
    ).toEqual([]);
    expect(
      filterProjectionTooltipEntries(payload(["2026-09_proj"]), "17", projectionStartDay).map(
        (e) => e.dataKey
      )
    ).toEqual(["2026-09_proj"]);
  });

  it("returns empty for missing payload and preserves payload on non-numeric labels", () => {
    expect(filterProjectionTooltipEntries(undefined, 16, projectionStartDay)).toEqual([]);
    const historical = payload(["2026-08"]);
    expect(filterProjectionTooltipEntries(historical, "Day?", projectionStartDay)).toEqual(
      historical
    );
  });
});
