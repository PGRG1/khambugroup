import { lazy, ComponentType } from "react";

const RELOAD_KEY = "bani.chunk.reloaded";

/**
 * React.lazy wrapper that survives stale deploy chunks.
 * If a dynamic import fails (old hashed file removed after a redeploy),
 * retry once, then force a one-time hard reload to fetch the new manifest.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      // one retry — transient network / cache miss
      try {
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_KEY);
        return mod;
      } catch (err2) {
        const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          // never resolves; page is reloading
          return new Promise<{ default: T }>(() => {});
        }
        throw err2;
      }
    }
  });
}
