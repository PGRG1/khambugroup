import { describe, expect, it } from "vitest";
import { checkSeatArgs } from "../../supabase/functions/chat-assistant/seatActions";

const one = [{ name: "Maison Francis" }];
const two = [{ name: "Assembly" }, { name: "Caliente" }];

describe("Bani seats card", () => {
  it("uses the only venue when none is named", () => {
    expect(checkSeatArgs({ seats: 50 }, one, "2026-11-10")).toMatchObject({ ok: true, seats: 50, from: "2026-11-10" });
  });
  it("asks which venue when there are several", () => {
    expect(checkSeatArgs({ seats: 50 }, two, "2026-11-10")).toMatchObject({ ok: false, error: "Which venue?" });
  });
  it("asks for a number instead of guessing", () => {
    expect(checkSeatArgs({ venue: "Maison Francis" }, one, "2026-11-10").ok).toBe(false);
    expect(checkSeatArgs({ venue: "Maison Francis", seats: 0 }, one, "2026-11-10").ok).toBe(false);
    expect(checkSeatArgs({ venue: "Maison Francis", seats: 49.5 }, one, "2026-11-10").ok).toBe(false);
  });
  it("matches the venue name and keeps a given start date", () => {
    expect(checkSeatArgs({ venue: "caliente", seats: 80, date: "2026-12-01" }, two, "2026-11-10")).toMatchObject({ ok: true, venue: { name: "Caliente" }, from: "2026-12-01" });
    expect(checkSeatArgs({ venue: "Hanabi", seats: 80 }, two, "2026-11-10").ok).toBe(false);
  });
});