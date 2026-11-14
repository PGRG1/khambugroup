import { describe, expect, it } from "vitest";
import { parallelPages } from "@/utils/parallelPages";

const source = (total: number) => {
  const calls: number[] = [];
  const build = async (from: number, to: number) => {
    calls.push(from);
    const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return { data: rows, error: null };
  };
  return { calls, build };
};

describe("parallelPages", () => {
  it("returns every row once, in order, like the one-page-at-a-time loop", async () => {
    for (const total of [0, 1, 999, 1000, 1001, 5999, 6000, 12345]) {
      const { build } = source(total);
      const rows = await parallelPages<number>(build);
      expect(rows.length).toBe(total);
      expect(rows.every((v, i) => v === i)).toBe(true);
    }
  });
  it("reads a short list with one request", async () => {
    const { calls, build } = source(40);
    await parallelPages<number>(build);
    expect(calls).toEqual([0]);
  });
  it("reads long lists in parallel waves", async () => {
    const { calls, build } = source(12000);
    await parallelPages<number>(build, { eager: true });
    expect(calls.length).toBeLessThanOrEqual(18);
  });
  it("stops on an error", async () => {
    await expect(parallelPages(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
