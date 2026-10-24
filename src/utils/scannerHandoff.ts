/**
 * In-memory handoff from floating Bani to the invoice scanner.
 * Original File objects live only in module memory — never in URLs,
 * localStorage or logs. Every request is scoped to the user+tenant+preview
 * identity that created it; a consumer must validate that scope before
 * touching the files, and the store is cleared whenever the identity resets.
 */
export type ScannerHandoff = {
  id: string;
  /** "open" only focuses the scanner and never carries files; "scan" starts extraction. */
  mode: "open" | "scan";
  files: File[];
  venue: string | null;
  /** `${userId}:${tenantId}:${isPreview}` of the requester. */
  scope: string;
};

let pending: ScannerHandoff | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function requestScannerHandoff(handoff: ScannerHandoff): void {
  pending = handoff;
  emit();
}

export function peekScannerHandoff(): ScannerHandoff | null {
  return pending;
}

/** Consume only the exact request; a newer handoff is never cleared by an old id. */
export function consumeScannerHandoff(id: string): void {
  if (pending?.id === id) {
    pending = null;
    emit();
  }
}

/** Drop any pending request outright (identity reset, sign-out, tenant switch). */
export function clearScannerHandoff(): void {
  if (pending) {
    pending = null;
    emit();
  }
}

export function subscribeScannerHandoff(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export type HandoffIntakeState = {
  /** Unsaved review, staged files or an in-flight scan — never overwrite. */
  dirty: boolean;
  /** Current `${userId}:${tenantId}:${isPreview}` identity. */
  identity: string;
  /** Edit authority, not preview, permissions finished loading. */
  canEdit: boolean;
};

export type HandoffDecision =
  | { kind: "skip" }
  | { kind: "open-only" }
  | { kind: "scan" }
  | { kind: "denied" };

/**
 * Pure intake decision, so rerenders and remounts can never start a second
 * scan: an id in `attempted` is never started again, whatever the state.
 */
export function decideHandoff(
  handoff: ScannerHandoff | null,
  state: HandoffIntakeState,
  attempted: ReadonlySet<string>,
): HandoffDecision {
  if (!handoff || attempted.has(handoff.id)) return { kind: "skip" };
  if (handoff.scope !== state.identity) return { kind: "skip" };
  if (handoff.mode === "open" || handoff.files.length === 0) return { kind: "open-only" };
  if (state.dirty) return { kind: "skip" };
  if (!state.canEdit) return { kind: "denied" };
  return { kind: "scan" };
}
