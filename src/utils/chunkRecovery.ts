const RELOAD_KEY = "bani:chunk-reload-at";
const RETRY_WINDOW_MS = 10_000;
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** Preserve Vite's rejection: cancelling preloadError resolves the import as undefined. */
export function installChunkRecovery(target: Window = window) {
  let lastAttempt = 0;
  const reload = () => {
    let last = lastAttempt;
    try {
      last = Math.max(last, Number(target.sessionStorage.getItem(RELOAD_KEY)) || 0);
    } catch { /* Storage may be unavailable; keep the in-memory guard. */ }
    const now = Date.now();
    if (now - last < RETRY_WINDOW_MS) return;
    lastAttempt = now;
    try { target.sessionStorage.setItem(RELOAD_KEY, String(now)); } catch { /* no-op */ }
    target.location.reload();
  };
  const onPreloadError = () => reload();
  const onRejection = (event: PromiseRejectionEvent) => {
    const message = String(event.reason?.message ?? event.reason ?? "");
    if (CHUNK_ERROR.test(message)) reload();
  };
  target.addEventListener("vite:preloadError", onPreloadError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("vite:preloadError", onPreloadError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}