// Pure rule shared by the server (dedupe on save) and the Settings page (collapse on display).
const FILLER = new Set(["a", "an", "the", "to", "for", "if", "of", "would", "like", "user", "you", "me", "please", "they", "i", "we"]);
const SYN: Record<string, string> = { ask: "prompt", asks: "prompt", prompts: "prompt", remind: "prompt" };
export const normaliseNote = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(normaliseNote(s).split(" ").filter((w) => w && !FILLER.has(w)).map((w) => SYN[w] ?? w));
export function sameNote(a: string, b: string) {
  const x = normaliseNote(a), y = normaliseNote(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / new Set([...A, ...B]).size >= 0.8;
}
