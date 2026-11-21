import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSystemPrompt, getDateContext } from "../../supabase/functions/_shared/assistantPrompt";
import { BANI_REASONING } from "../../supabase/functions/_shared/baniBrain";
import { openingHours, termsOn, usualPattern } from "../../supabase/functions/chat-assistant/rotaPlanningRules";

describe("Bani thinks before answering", () => {
  it("leads every chat with the voice brief and plans at medium effort", () => {
    const p = buildSystemPrompt(getDateContext(new Date("2026-11-21T04:00:00Z")), { venues: ["Assembly"] });
    expect(p).toContain("## How you think and talk");
    expect(p).toMatch(/Find out before you ask/);
    expect(p).toMatch(/never answer with buttons alone/);
    expect(BANI_REASONING).toBe("medium");
  });

  it("rota planning reads opening hours, terms and usual patterns", () => {
    const periods = [
      { venue_id: "v", is_active: true, is_rollup_only: false, applicable_weekdays: [2, 3], effective_from: "2026-01-01", effective_to: null, start_time: "12:00:00", end_time: "15:00:00" },
      { venue_id: "v", is_active: true, is_rollup_only: false, applicable_weekdays: [2, 3], effective_from: "2026-01-01", effective_to: null, start_time: "18:00:00", end_time: "22:00:00" },
    ];
    const hours = openingHours(periods, "v", ["2026-11-30", "2026-12-01"]);
    expect(hours[0]).toMatchObject({ weekday: "Mon", known: false });
    expect(hours[1]).toMatchObject({ weekday: "Tue", open: "12:00", close: "22:00", known: true });
    expect(termsOn({ id: "e", employment_type: "part_time" }, [{ employee_id: "e", effective_date: "2026-10-01", values: { weekly_hours: 20 } }, { employee_id: "e", effective_date: "2027-01-01", values: { weekly_hours: 30 } }], "2026-11-30"))
      .toMatchObject({ employment_type: "part_time", weekly_hours: 20 });
    const p = usualPattern([
      { shift_date: "2026-11-17", start_time: "11:00", end_time: "20:00", shift_type: "regular" },
      { shift_date: "2026-11-18", start_time: "11:00", end_time: "20:00", shift_type: "regular" },
      { shift_date: "2026-11-24", start_time: "11:00", end_time: "20:00", shift_type: "regular" },
      { shift_date: "2026-11-23", start_time: "00:00", end_time: "00:00", shift_type: "RD" },
    ]);
    expect(p).toMatchObject({ usual_start: "11:00", usual_end: "20:00", days_per_week: 1.5 });
    expect(usualPattern([])).toBeNull();
  });

  it("an agreed proposal can name people, but saves still go through checked People cards", () => {
    const src = readFileSync("supabase/functions/chat-assistant/peopleActions.ts", "utf8");
    expect(src).toContain("exactPerson(s.person, ctx.people)");
    expect(src).toMatch(/establishedScope\(rotaScope, s\.person/);
    const idx = readFileSync("supabase/functions/chat-assistant/index.ts", "utf8");
    expect(idx).toContain("get_rota_planning_context");
    expect(idx).toContain("call get_rota_planning_context first");
    const plan = readFileSync("supabase/functions/chat-assistant/rotaPlanning.ts", "utf8");
    expect(plan).toContain("peopleContext(client, tenant, user");
    expect(plan).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});
