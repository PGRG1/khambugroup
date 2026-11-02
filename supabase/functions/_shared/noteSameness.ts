// Pure rule shared by the server (dedupe on save) and the Settings page (collapse on display).
export const normaliseNote = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
export function sameNote(a: string, b: string) {
  const x = normaliseNote(a), y = normaliseNote(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const A = new Set(x.split(" ")), B = new Set(y.split(" "));
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / new Set([...A, ...B]).size >= 0.85;
}
