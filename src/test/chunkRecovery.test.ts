import { afterEach, describe, expect, it, vi } from "vitest";
import { installChunkRecovery } from "@/utils/chunkRecovery";

afterEach(() => vi.restoreAllMocks());

function setup(storageAvailable = true) {
  const events = new EventTarget();
  const storage = new Map<string, string>();
  const reload = vi.fn();
  const target = Object.assign(events, {
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => {
        if (!storageAvailable) throw new Error("Storage disabled");
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  }) as unknown as Window;
  installChunkRecovery(target);
  return { target, reload };
}

describe("failed screen download recovery", () => {
  it("keeps Vite's failed import rejected instead of resolving undefined", async () => {
    const { target, reload } = setup();
    const failure = new Error("Failed to fetch dynamically imported module");
    // Vite's generated helper throws only when preloadError is not cancelled.
    const importResult = Promise.reject(failure).catch((error) => {
      const event = new Event("vite:preloadError", { cancelable: true });
      target.dispatchEvent(event);
      if (!event.defaultPrevented) throw error;
    });
    await expect(importResult).rejects.toBe(failure);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads at most once within ten seconds, including after reinstall", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const { target, reload } = setup();
    target.dispatchEvent(new Event("vite:preloadError"));
    installChunkRecovery(target);
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers with a guard when browser storage is unavailable", () => {
    const { target, reload } = setup(false);
    target.dispatchEvent(new Event("vite:preloadError"));
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated errors and recovers failed module rejections", () => {
    const { target, reload } = setup();
    const emit = (message: string) => {
      const event = new Event("unhandledrejection", { cancelable: true });
      Object.defineProperty(event, "reason", { value: new Error(message) });
      target.dispatchEvent(event);
      return event;
    };
    emit("Cannot read properties of undefined (reading 'default')");
    expect(reload).not.toHaveBeenCalled();
    expect(emit("Failed to fetch dynamically imported module").defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});