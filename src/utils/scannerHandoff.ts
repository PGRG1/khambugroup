/**
 * In-memory handoff from floating Bani to the invoice scanner.
 * Original File objects live only in module memory — never in URLs,
 * localStorage or logs — and are consumed once a scan starts.
 */
export type ScannerHandoff = { id: string; files: File[]; venue: string | null };

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

export function subscribeScannerHandoff(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
