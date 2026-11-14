/**
 * Which app frame this browser last opened after sign-in: the client portal ("tenant")
 * or the platform console ("platform"). Used only to draw an empty, data-free frame while
 * the first access decision is made, so a returning client user never sees a blank screen.
 * It never grants or implies access: the real decision still comes from resolveAuthRoute.
 */
export type LastShell = "tenant" | "platform";

const KEY = "bani-last-shell";

export function readLastShell(): LastShell | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "tenant" || v === "platform" ? v : null;
  } catch {
    return null;
  }
}

export function writeLastShell(v: LastShell): void {
  try {
    if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable: the plain loading screen is used instead */
  }
}

export function clearLastShell(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
