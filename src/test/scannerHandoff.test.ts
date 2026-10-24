import { describe, expect, it, vi } from "vitest";
import {
  consumeScannerHandoff,
  peekScannerHandoff,
  requestScannerHandoff,
  subscribeScannerHandoff,
} from "@/utils/scannerHandoff";

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("scannerHandoff", () => {
  it("stores a request and notifies subscribers", () => {
    const fn = vi.fn();
    const off = subscribeScannerHandoff(fn);
    requestScannerHandoff({ id: "a", files: [file("inv.jpg")], venue: "Assembly" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(peekScannerHandoff()?.id).toBe("a");
    off();
  });

  it("consumes only the matching id, so a stale consumer cannot clear a newer request", () => {
    requestScannerHandoff({ id: "old", files: [], venue: null });
    requestScannerHandoff({ id: "new", files: [file("b.pdf")], venue: null });
    consumeScannerHandoff("old");
    expect(peekScannerHandoff()?.id).toBe("new");
    consumeScannerHandoff("new");
    expect(peekScannerHandoff()).toBeNull();
  });

  it("a consumed handoff stays consumed — remounts must not rescan", () => {
    requestScannerHandoff({ id: "once", files: [file("c.png")], venue: null });
    consumeScannerHandoff("once");
    expect(peekScannerHandoff()).toBeNull();
    consumeScannerHandoff("once");
    expect(peekScannerHandoff()).toBeNull();
  });

  it("unsubscribed listeners are not called", () => {
    const fn = vi.fn();
    const off = subscribeScannerHandoff(fn);
    off();
    requestScannerHandoff({ id: "z", files: [], venue: null });
    expect(fn).not.toHaveBeenCalled();
    consumeScannerHandoff("z");
  });
});
