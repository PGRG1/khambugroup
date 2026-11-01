import { describe, expect, it } from "vitest";
import { checkDocumentDate, sameDocument } from "../../supabase/functions/_shared/documentChecks";
describe("document printed date evidence", () => {
  it("does not turn the real 2006 sales misread into 2026 based on upload context alone", () => expect(checkDocumentDate({ date: "2006-07-05", raw: "05/07/06", uploadDay: "2026-07-08" }).reasons).toHaveLength(1));
  it("corrects 2006 with independent 2026 printed evidence", () => expect(checkDocumentDate({ date: "2006-07-05", raw: "05/07/26", uploadDay: "2026-07-08", corroboratedDate: "2026-07-05", weekday: "Sun" }).correction).toBe("Year read as 2006, corrected to 2026"));
  it("handles the real 2024 wrong day/year only with corroborated reading", () => expect(checkDocumentDate({ date: "2024-10-26", raw: "24/10/26", uploadDay: "2026-10-25", corroboratedDate: "2026-10-24", weekday: "Sat" }).date).toBe("2026-10-24"));
  it("blocks the real invoice 2028 future year", () => expect(checkDocumentDate({ date: "2028-07-22", raw: "22/07/2028", uploadDay: "2026-08-08" }).reasons[0]).toContain("future"));
  it("corrects 2028 only with independent 2026 evidence", () => expect(checkDocumentDate({ date: "2028-07-22", raw: "22/07/26", uploadDay: "2026-08-08", corroboratedDate: "2026-07-22" }).correction).toBe("Year read as 2028, corrected to 2026"));
  it("preserves clearly printed historical dates", () => expect(checkDocumentDate({ date: "2024-10-26", raw: "26 Oct 2024", explicitHistorical: true, uploadDay: "2026-10-25", corroboratedDate: "2026-10-24" })).toEqual({ date: "2024-10-26", correction: null, reasons: [] }));
  it("blocks an invalid calendar date", () => expect(checkDocumentDate({ date: "2026-02-30", raw: "", uploadDay: "2026-03-01" }).reasons).toHaveLength(1));
  it("60 days passes, 61 days needs evidence", () => { expect(checkDocumentDate({ date: "2026-09-02", raw: "", uploadDay: "2026-11-01" }).reasons).toEqual([]); expect(checkDocumentDate({ date: "2026-09-01", raw: "", uploadDay: "2026-11-01" }).reasons).toHaveLength(1); });
  it("printed weekday must match", () => expect(checkDocumentDate({ date: "2026-10-31", raw: "", weekday: "Fri", uploadDay: "2026-11-01" }).reasons[0]).toContain("weekday"));
});
describe("document duplicates", () => {
  const a = { date: "2026-10-31", party: "Caliente", total: 11003, fingerprint: "tenders" };
  it("does not equate same amounts on different days", () => expect(sameDocument(a, { ...a, date: "2026-10-30" })).toBe(false));
  it("same day/party/full fingerprint is duplicate", () => expect(sameDocument(a, a)).toBe(true));
  it("same source bytes remain duplicate after a date edit", () => expect(sameDocument({ ...a, hash: "abc" }, { ...a, date: "2006-07-05", hash: "abc" })).toBe(true));
});