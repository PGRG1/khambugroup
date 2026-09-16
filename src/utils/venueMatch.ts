/**
 * Venue name matching helpers for receipt scanning.
 *
 * The scanner must never silently reassign a scanned venue to a different
 * master venue — only an exact case-insensitive, trimmed match is accepted.
 */

/** Match a scanned/raw venue string against the active venue master. */
export function matchVenueName(raw: string, venueNames: string[]): string {
  const needle = String(raw ?? "").trim().toLowerCase();
  if (!needle) return "";
  return venueNames.find((n) => String(n ?? "").trim().toLowerCase() === needle) ?? "";
}

/**
 * Whether an auto-supplied file (Upload Sales → scanner) may be processed yet.
 * Extraction must wait until the venue master has finished loading, otherwise
 * the scanned venue is matched against an empty list and stored blank.
 */
export function shouldAutoProcessInitialFile(args: {
  initialFile: File | null | undefined;
  venuesLoading: boolean;
  alreadyStarted: File | null;
}): boolean {
  const { initialFile, venuesLoading, alreadyStarted } = args;
  if (!initialFile) return false;
  if (venuesLoading) return false;
  return alreadyStarted !== initialFile;
}
