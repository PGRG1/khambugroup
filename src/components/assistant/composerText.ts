/** Measuring the composer hint and draft (shared by Bani's chat bar and Home's stand-in bar). */
let hintCanvas: CanvasRenderingContext2D | null = null;
/** Cut a hint to the box's width with "…" so it stays on one line. */
/** Cut a hint to the box's width with "…" so it stays on one line. */
export function fitHint(el: HTMLTextAreaElement, text: string) {
  const cs = getComputedStyle(el);
  const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
  if (room <= 0) return text;
  hintCanvas ??= document.createElement("canvas").getContext("2d");
  if (!hintCanvas) return text;
  hintCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if (hintCanvas.measureText(text).width <= room) return text;
  let cut = text;
  while (cut.length > 1 && hintCanvas.measureText(`${cut.trimEnd()}…`).width > room) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Width of one line of text in the box's font. */
export function textWidth(el: HTMLTextAreaElement, text: string) {
  const cs = getComputedStyle(el);
  hintCanvas ??= document.createElement("canvas").getContext("2d");
  if (!hintCanvas) return 0;
  hintCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return hintCanvas.measureText(text).width;
}
