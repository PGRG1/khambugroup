import { describe, expect, it, vi } from "vitest";
import {
  clearScannerHandoff,
  consumeScannerHandoff,
  decideHandoff,
  peekScannerHandoff,
  requestScannerHandoff,
  subscribeScannerHandoff,
  type ScannerHandoff,
} from "@/utils/scannerHandoff";

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const SCOPE = "user-1:tenant-1:false";
const handoff = (over: Partial<ScannerHandoff> = {}): ScannerHandoff => ({
  id: "h1", mode: "scan", files: [file("inv.jpg")], venue: null, scope: SCOPE, ...over,
});
const state = { dirty: false, identity: SCOPE, canEdit: true };

describe("scannerHandoff store", () => {
  it("stores a request and notifies subscribers", () => {
    const fn = vi.fn();
    const off = subscribeScannerHandoff(fn);
    requestScannerHandoff(handoff({ id: "a" }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(peekScannerHandoff()?.id).toBe("a");
    off();
  });

  it("consumes only the matching id, so a stale consumer cannot clear a newer request", () => {
    requestScannerHandoff(handoff({ id: "old" }));
    requestScannerHandoff(handoff({ id: "new" }));
    consumeScannerHandoff("old");
    expect(peekScannerHandoff()?.id).toBe("new");
    consumeScannerHandoff("new");
    expect(peekScannerHandoff()).toBeNull();
  });

  it("clearScannerHandoff drops a pending request on identity reset", () => {
    requestScannerHandoff(handoff({ id: "scoped" }));
    clearScannerHandoff();
    expect(peekScannerHandoff()).toBeNull();
  });

  it("unsubscribed listeners are not called", () => {
    const fn = vi.fn();
    const off = subscribeScannerHandoff(fn);
    off();
    requestScannerHandoff(handoff({ id: "z" }));
    expect(fn).not.toHaveBeenCalled();
    consumeScannerHandoff("z");
  });
});

describe("decideHandoff", () => {
  it("scans a valid in-scope scan request exactly once across rerenders", () => {
    const attempted = new Set<string>();
    expect(decideHandoff(handoff(), state, attempted)).toEqual({ kind: "scan" });
    attempted.add("h1");
    // Rerender/remount with the same id never rescans.
    expect(decideHandoff(handoff(), state, attempted)).toEqual({ kind: "skip" });
    expect(decideHandoff(handoff(), state, attempted)).toEqual({ kind: "skip" });
  });

  it("a failed attempt is not retried automatically — the id stays attempted", () => {
    const attempted = new Set<string>(["h1"]);
    // Simulates: scan failed, component rerendered, store still holds nothing new.
    expect(decideHandoff(handoff(), state, attempted).kind).toBe("skip");
  });

  it("rejects files from another user/tenant/preview scope", () => {
    const foreign = handoff({ scope: "user-9:tenant-9:false" });
    expect(decideHandoff(foreign, state, new Set()).kind).toBe("skip");
    const preview = handoff({ scope: "user-1:tenant-1:true" });
    expect(decideHandoff(preview, state, new Set()).kind).toBe("skip");
  });

  it("never scans over dirty work (unsaved review, staged files or active scan)", () => {
    expect(decideHandoff(handoff(), { ...state, dirty: true }, new Set()).kind).toBe("skip");
  });

  it("open mode never carries files into a scan, even with files present", () => {
    const open = handoff({ mode: "open" });
    expect(decideHandoff(open, state, new Set())).toEqual({ kind: "open-only" });
    expect(decideHandoff(open, { ...state, dirty: true }, new Set())).toEqual({ kind: "open-only" });
  });

  it("read-only users may open but may not scan", () => {
    expect(decideHandoff(handoff({ mode: "open" }), { ...state, canEdit: false }, new Set())).toEqual({ kind: "open-only" });
    expect(decideHandoff(handoff(), { ...state, canEdit: false }, new Set())).toEqual({ kind: "denied" });
  });
});

import { consumeSalesHandoff as consumeSales, decideSalesHandoff, peekScannerHandoff as peekInvoice, peekSalesHandoff, requestSalesHandoff } from "@/utils/scannerHandoff";

describe("sales receipt handoff", () => {
  const file = new File(["x"], "z-report.jpg", { type: "image/jpeg" });
  it("never lands in the invoice scanner slot", () => {
    const before = peekInvoice();
    requestSalesHandoff({ id: "s1", file, scope: "u:t:false" });
    expect(peekInvoice()).toBe(before);
    expect(peekSalesHandoff()?.id).toBe("s1");
    consumeSales("s1");
    expect(peekSalesHandoff()).toBeNull();
  });
  it("only scans for the same user, client and preview identity with edit access", () => {
    const h = { id: "s2", file, scope: "u:t:false" };
    expect(decideSalesHandoff(h, { identity: "other:t:false", canScan: true, busy: false })).toBe("skip");
    expect(decideSalesHandoff(h, { identity: "u:t:false", canScan: false, busy: false })).toBe("denied");
    expect(decideSalesHandoff(h, { identity: "u:t:false", canScan: true, busy: false })).toBe("scan");
  });
});
