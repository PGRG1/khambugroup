export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const ZOOM_STEP = 0.25;

export type FitMode = "page" | "width" | "manual";

export interface Size {
  width: number;
  height: number;
}

export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Bounding box of a size rotated by deg (multiples of 90 handled exactly). */
export function rotatedSize(size: Size, deg: number): Size {
  const rot = normalizeRotation(deg);
  const rad = (rot * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const width = size.width * cos + size.height * sin;
  const height = size.width * sin + size.height * cos;
  return { width: round(width), height: round(height) };
}

function round(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : Math.round(value * 1e6) / 1e6;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  const pct = Math.round(clampZoom(zoom) * 100);
  const stepPct = ZOOM_STEP * 100;
  const next = direction > 0
    ? (Math.floor(pct / stepPct) + 1) * stepPct
    : (Math.ceil(pct / stepPct) - 1) * stepPct;
  return clampZoom(next / 100);
}

/** Scale so the rotated page fits fully inside the viewport (with padding). */
export function fitPageScale(natural: Size, viewport: Size, rotation: number, padding = 24): number {
  if (!natural.width || !natural.height || !viewport.width || !viewport.height) return 1;
  const rot = rotatedSize(natural, rotation);
  const availW = Math.max(1, viewport.width - padding);
  const availH = Math.max(1, viewport.height - padding);
  return clampZoom(Math.min(availW / rot.width, availH / rot.height));
}

/** Scale so the rotated page fills the viewport width (with padding). */
export function fitWidthScale(natural: Size, viewport: Size, rotation: number, padding = 24): number {
  if (!natural.width || !natural.height || !viewport.width) return 1;
  const rot = rotatedSize(natural, rotation);
  const availW = Math.max(1, viewport.width - padding);
  return clampZoom(availW / rot.width);
}

/** Layout size of the stage element that hosts the centred transformed page. */
export function stageSize(natural: Size, viewport: Size, rotation: number, zoom: number): Size {
  const rot = rotatedSize(natural, rotation);
  const scaled = { width: rot.width * zoom, height: rot.height * zoom };
  return {
    width: round(Math.max(scaled.width, viewport.width || 0)),
    height: round(Math.max(scaled.height, viewport.height || 0)),
  };
}

export function resolveFitScale(
  mode: FitMode,
  natural: Size,
  viewport: Size,
  rotation: number,
  manualZoom: number,
  padding = 24,
): number {
  if (mode === "page") return fitPageScale(natural, viewport, rotation, padding);
  if (mode === "width") return fitWidthScale(natural, viewport, rotation, padding);
  return clampZoom(manualZoom);
}

/** Normalize a wheel delta across deltaMode units. */
export function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  return deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
}

export function wheelZoom(zoom: number, deltaY: number, deltaMode: number, intensity = 0.0015): number {
  const dy = normalizeWheelDelta(deltaY, deltaMode);
  return clampZoom(zoom * Math.exp(-dy * intensity));
}
