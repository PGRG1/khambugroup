import { beforeEach, describe, expect, it } from "vitest";
import { canOpen, workLink } from "@/utils/workLogLinks";
import { firstName, readCachedName, writeCachedName } from "@/utils/displayNameCache";
import { clearLastShell, readLastShell, writeLastShell } from "@/utils/lastShell";

describe("work log links", () => {
  it("opens the exact invoice and sales record", () => {
    expect(workLink({ kind: "invoice", id: "abc" }).to).toBe("/procurement/invoices?invoice=abc");
    expect(workLink({ kind: "sales", id: "s1" }).to).toBe("/sales-data/s1");
  });
  it("never links to retired routes that bounce to Home", () => {
    const all = [
      workLink({ kind: "bill", id: "b" }), workLink({ kind: "bank", id: "t" }),
      workLink({ kind: "payroll_accrual", month: "2026-10-31" }), workLink({ kind: "depreciation", month: "2026-10-31" }),
    ];
    for (const l of all) expect(l.to).not.toMatch(/^\/(your-team|finance\/bills-expenses|bank\/)/);
    expect(workLink({ kind: "depreciation", month: "2026-10-31" }).to).toBe("/finance/close?month=2026-10");
  });
  it("follows the same access rules as the route guards", () => {
    const none = () => false;
    const staff = { isAdmin: false, isPreviewActive: false, canAccessPage: none };
    expect(canOpen(workLink({ kind: "bill", id: "b" }), staff)).toBe(false);
    expect(canOpen(workLink({ kind: "invoice", id: "i" }), staff)).toBe(false);
    expect(canOpen(workLink({ kind: "invoice", id: "i" }), { ...staff, canAccessPage: (p) => p === "invoices" })).toBe(true);
    expect(canOpen(workLink({ kind: "invoice", id: "i" }), { isAdmin: true, isPreviewActive: false, canAccessPage: none })).toBe(true);
    expect(canOpen(workLink({ kind: "invoice", id: "i" }), { isAdmin: true, isPreviewActive: true, canAccessPage: none })).toBe(false);
    expect(canOpen(null, { isAdmin: true, isPreviewActive: false, canAccessPage: none })).toBe(false);
  });
});

describe("greeting name cache", () => {
  beforeEach(() => localStorage.clear());
  it("keeps only the first name and never invents one", () => {
    expect(firstName("Prashant Gurung")).toBe("Prashant");
    expect(firstName("")).toBe("");
    expect(firstName(undefined)).toBe("");
  });
  it("is kept per user", () => {
    writeCachedName("u1", "Prashant");
    expect(readCachedName("u1")).toBe("Prashant");
    expect(readCachedName("u2")).toBe("");
    writeCachedName("u1", "");
    expect(readCachedName("u1")).toBe("");
  });
});

describe("last shell", () => {
  beforeEach(() => localStorage.clear());
  it("remembers tenant or platform only, and clears", () => {
    expect(readLastShell()).toBeNull();
    writeLastShell("tenant");
    expect(readLastShell()).toBe("tenant");
    localStorage.setItem("bani-last-shell", "nonsense");
    expect(readLastShell()).toBeNull();
    writeLastShell("platform");
    clearLastShell();
    expect(readLastShell()).toBeNull();
  });
});
