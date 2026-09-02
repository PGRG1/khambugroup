import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitPageScale,
  fitWidthScale,
  normalizeRotation,
  resolveFitScale,
  rotatedSize,
  stageSize,
  stepZoom,
  wheelZoom,
} from "@/utils/invoiceViewerTransform";

const portrait = { width: 800, height: 1200 };
const landscape = { width: 1600, height: 900 };
const viewport = { width: 600, height: 700 };

describe("rotatedSize", () => {
  it("keeps dimensions at 0 and 180 degrees", () => {
    expect(rotatedSize(portrait, 0)).toEqual(portrait);
    expect(rotatedSize(portrait, 180)).toEqual(portrait);
    expect(rotatedSize(landscape, 180)).toEqual(landscape);
  });

  it("swaps dimensions at 90 and 270 degrees", () => {
    expect(rotatedSize(portrait, 90)).toEqual({ width: 1200, height: 800 });
    expect(rotatedSize(portrait, 270)).toEqual({ width: 1200, height: 800 });
    expect(rotatedSize(landscape, 90)).toEqual({ width: 900, height: 1600 });
  });

  it("normalizes negative and overflowing rotations", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(rotatedSize(portrait, -90)).toEqual({ width: 1200, height: 800 });
  });
});

describe("fit scales", () => {
  it("fits the whole portrait page inside the viewport", () => {
    const scale = fitPageScale(portrait, viewport, 0);
    expect(scale).toBeCloseTo(Math.min((600 - 24) / 800, (700 - 24) / 1200), 6);
    expect(800 * scale).toBeLessThanOrEqual(600);
    expect(1200 * scale).toBeLessThanOrEqual(700);
  });

  it("refits when rotated 90 degrees", () => {
    const scale = fitPageScale(portrait, viewport, 90);
    expect(scale).toBeCloseTo(Math.min((600 - 24) / 1200, (700 - 24) / 800), 6);
  });

  it("fits landscape width", () => {
    expect(fitWidthScale(landscape, viewport, 0)).toBeCloseTo((600 - 24) / 1600, 6);
    expect(fitWidthScale(landscape, viewport, 90)).toBeCloseTo((600 - 24) / 900, 6);
  });

  it("returns 1 for unknown dimensions", () => {
    expect(fitPageScale({ width: 0, height: 0 }, viewport, 0)).toBe(1);
    expect(fitWidthScale(portrait, { width: 0, height: 0 }, 0)).toBe(1);
  });
});

describe("zoom clamping and stepping", () => {
  it("clamps between 10% and 500%", () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(1.25)).toBe(1.25);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("steps by 25 percentage points", () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25, 6);
    expect(stepZoom(1, -1)).toBeCloseTo(0.75, 6);
    expect(stepZoom(0.37, 1)).toBeCloseTo(0.5, 6);
    expect(stepZoom(0.37, -1)).toBeCloseTo(0.25, 6);
    expect(stepZoom(5, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(0.1, -1)).toBe(MIN_ZOOM);
  });

  it("zooms by wheel delta magnitude and clamps", () => {
    expect(wheelZoom(1, -100, 0)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100, 0)).toBeLessThan(1);
    expect(wheelZoom(1, -100, 1)).toBeGreaterThan(wheelZoom(1, -100, 0));
    expect(wheelZoom(5, -1000, 0)).toBe(MAX_ZOOM);
  });
});

describe("stageSize", () => {
  it("is at least the viewport so the page can centre", () => {
    const size = stageSize(portrait, viewport, 0, 0.1);
    expect(size).toEqual({ width: 600, height: 700 });
  });

  it("matches the rotated scaled bounding box when larger", () => {
    expect(stageSize(portrait, viewport, 90, 2)).toEqual({ width: 2400, height: 1600 });
  });
});

describe("resolveFitScale", () => {
  it("routes by mode", () => {
    expect(resolveFitScale("page", portrait, viewport, 0)).toBeCloseTo(fitPageScale(portrait, viewport, 0), 6);
    expect(resolveFitScale("width", portrait, viewport, 0)).toBeCloseTo(fitWidthScale(portrait, viewport, 0), 6);
    expect(resolveFitScale("manual", portrait, viewport, 0, 3)).toBe(3);
    expect(resolveFitScale("manual", portrait, viewport, 0, 99)).toBe(MAX_ZOOM);
  });
});
