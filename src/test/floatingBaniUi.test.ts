import { describe, expect, it } from "vitest";
import { attachmentError, clampPoint, isTap, moduleLabel, overDismiss } from "@/utils/floatingBaniUi";

describe("floating Bani UI rules", () => {
  it("labels Home and modules truthfully", () => {
    expect(moduleLabel("/")).toBe("Home");
    expect(moduleLabel("/procurement/invoices")).toBe("Procurement");
    expect(moduleLabel("/finance-team")).toBe("Finance Team");
    expect(moduleLabel("/hr/leave")).toBe("People");
  });
  it("accepts only JPEG/PNG/WebP/PDF up to 4 MB, 3 files, 8 MB total", () => {
    expect(attachmentError({ name: "a.pdf", type: "application/pdf", size: 1000 }, [])).toBeNull();
    expect(attachmentError({ name: "a.docx", type: "application/msword", size: 10 }, [])).toMatch(/only JPEG/);
    expect(attachmentError({ name: "a.png", type: "image/png", size: 5 * 1024 * 1024 }, [])).toMatch(/4 MB/);
    expect(attachmentError({ name: "a.png", type: "image/png", size: 10 }, [{ size: 1 }, { size: 1 }, { size: 1 }])).toMatch(/up to 3/);
    expect(attachmentError({ name: "a.png", type: "image/png", size: 3e6 }, [{ size: 3e6 }, { size: 3e6 }])).toMatch(/8 MB/);
  });
  it("treats a short still press as tap and a hold or move as not a tap", () => {
    expect(isTap(2, 120)).toBe(true);
    expect(isTap(2, 400)).toBe(false);
    expect(isTap(20, 100)).toBe(false);
  });
  it("detects release over the bottom-centre dismiss target and clamps elsewhere", () => {
    expect(overDismiss({ x: 176, y: 704 }, 48, 200, 728)).toBe(true);
    expect(overDismiss({ x: 20, y: 100 }, 48, 200, 728)).toBe(false);
    expect(clampPoint({ x: -50, y: 9999 }, 48, 400, 800)).toEqual({ x: 8, y: 744 });
  });
});

import { teamRole, teamRoles } from "@/utils/floatingBaniUi";
describe("teamRole", () => {
  it("maps each area to one decisive title", () => {
    expect(teamRole("/procurement/invoices")).toBe("Procurement Analyst");
    expect(teamRole("/sales-data")).toBe("Revenue Manager");
    expect(teamRole("/bank")).toBe("Accountant");
    expect(teamRole("/petty-cash")).toBe("Accountant");
    expect(teamRole("/finance/payables")).toBe("Accountant");
    expect(teamRole("/pl-report")).toBe("Financial Controller");
    expect(teamRole("/")).toBeNull();
  });
  it("shows no role unprompted on home and joins two roles for cross-area questions", () => {
    expect(teamRoles("", "/")).toEqual([]);
    expect(teamRoles("why don't sales match bank deposits", "/")).toEqual(["Revenue Manager", "Accountant"]);
    expect(teamRoles("hello", "/bank")).toEqual(["Accountant"]);
  });
  it("never uses slashes in a title", () => {
    for (const p of ["/bank", "/procurement", "/revenue", "/finance"]) expect(teamRole(p)).not.toContain("/");
  });
});
