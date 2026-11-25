import { afterEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkRecovery } from "../utils/staleChunkRecovery";

function setup(blockStorage = false) {
  const target = new EventTarget();
  const reload = vi.fn();
  const storage = new Map<string, string>();
  Object.assign(target, {
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => { if (blockStorage) throw new Error("Blocked"); return storage.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (blockStorage) throw new Error("Blocked"); storage.set(key, value); },
    },
  });
  installStaleChunkRecovery(target as unknown as Window);
  return { target, reload };
}

afterEach(() => vi.restoreAllMocks());

describe("stale chunk recovery", () => {
  it("preserves Vite's failed-import rejection instead of resolving undefined", async () => {
    const { target, reload } = setup();
    const failure = new Error("Failed to fetch dynamically imported module");
    const viteImport = async () => {
      const event = new Event("vite:preloadError", { cancelable: true });
      target.dispatchEvent(event);
      if (!event.defaultPrevented) throw failure;
      return undefined;
    };
    await expect(viteImport()).rejects.toBe(failure);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads at most once within 10 seconds, including blocked storage", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const { target, reload } = setup(true);
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    const second = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(second);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(110_000);
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not suppress unrelated application failures", () => {
    const { target, reload } = setup();
    const event = new Event("unhandledrejection", { cancelable: true });
    Object.assign(event, { reason: new Error("Application failure") });
    target.dispatchEvent(event);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});