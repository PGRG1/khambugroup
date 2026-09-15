import { describe, it, expect } from "vitest";
import { alignBatchResults, extractBatchItems } from "../../supabase/functions/_shared/aiBatchAlign";

describe("suggest_batch response alignment", () => {
  it("aligns a 2-line batch returned as { items: [...] }", () => {
    const out = alignBatchResults(
      { items: [
        { line_index: 1, product_master_id: "p2", confidence: 0.9 },
        { line_index: 0, product_master_id: "p1", confidence: 0.8 },
      ] },
      [0, 1],
    );
    expect(out.map((r) => r.line_index)).toEqual([0, 1]);
    expect(out[0].item.product_master_id).toBe("p1");
    expect(out[1].item.product_master_id).toBe("p2");
  });

  it("aligns a bare array without line_index positionally for a 2+ line batch", () => {
    const out = alignBatchResults(
      [{ product_master_id: "a" }, { product_master_id: "b" }, { product_master_id: "c" }],
      [3, 4, 5],
    );
    expect(out.map((r) => r.line_index)).toEqual([3, 4, 5]);
    expect(out.map((r) => r.item.product_master_id)).toEqual(["a", "b", "c"]);
  });

  it("accepts a single direct output_action object for a one-line batch", () => {
    const out = alignBatchResults({ product_master_id: "p9", confidence: 0.95 }, [0]);
    expect(out).toHaveLength(1);
    expect(out[0].item.product_master_id).toBe("p9");
    expect(out[0].line_index).toBe(0);
  });

  it("drops unindexed leftovers rather than misaligning rows", () => {
    const out = alignBatchResults([{ product_master_id: "x" }], [0, 1]);
    expect(out).toEqual([]);
  });

  it("ignores duplicate and out-of-range line_index values", () => {
    const out = alignBatchResults(
      { items: [
        { line_index: 0, product_master_id: "a" },
        { line_index: 0, product_master_id: "dupe" },
        { line_index: 7, product_master_id: "oob" },
      ] },
      [0, 1],
    );
    expect(out).toHaveLength(2);
    expect(out[0].item.product_master_id).toBe("a");
    // remaining leftovers (2) !== free lines (1) -> dropped
    expect(out[1].line_index).toBe(0);
  });

  it("extracts items from lines/results wrappers too", () => {
    expect(extractBatchItems({ lines: [{ a: 1 }] })).toHaveLength(1);
    expect(extractBatchItems({ results: [{ a: 1 }, { b: 2 }] })).toHaveLength(2);
    expect(extractBatchItems(null)).toEqual([]);
  });
});
