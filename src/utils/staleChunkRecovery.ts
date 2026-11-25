const RELOAD_KEY = "bani:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function installStaleChunkRecovery(target: Window) {
  let lastReload = 0;
  function reloadOnce(): boolean {
    const now = Date.now();
    let stored = 0;
    try { stored = Number(target.sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* storage may be blocked */ }
    if (now - Math.max(lastReload, stored) < RELOAD_COOLDOWN_MS) return false;
    lastReload = now;
    try { target.sessionStorage.setItem(RELOAD_KEY, String(now)); } catch { /* keep the in-memory guard */ }
    target.location.reload();
    return true;
  }

  function onPreloadError() {
    // Vite resolves failed imports to undefined if this event is cancelled.
    // Preserve the rejection so React.lazy never receives an undefined module.
    reloadOnce();
  }
  function onUnhandledRejection(event: PromiseRejectionEvent) {
    const message = String(event.reason?.message ?? event.reason ?? "");
    if (CHUNK_ERROR.test(message) && reloadOnce()) event.preventDefault();
  }
  target.addEventListener("vite:preloadError", onPreloadError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    target.removeEventListener("vite:preloadError", onPreloadError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}