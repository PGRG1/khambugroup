/**
 * The greeting name, remembered on this device per signed-in user so Home can greet by name
 * from the first frame. Display only. Never derived from the email address.
 */
const key = (userId: string) => `bani-display-name-${userId}`;

/** First word of a display name; empty when there is no real name. */
export function firstName(name: unknown): string {
  return typeof name === "string" ? name.trim().split(/\s+/)[0] ?? "" : "";
}

export function readCachedName(userId: string | null | undefined): string {
  if (!userId) return "";
  try { return firstName(localStorage.getItem(key(userId))); } catch { return ""; }
}

export function writeCachedName(userId: string | null | undefined, name: string): void {
  if (!userId) return;
  try {
    if (name) localStorage.setItem(key(userId), name);
    else localStorage.removeItem(key(userId));
  } catch { /* storage unavailable: the name fades in instead */ }
}
