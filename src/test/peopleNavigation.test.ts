import { describe, expect, it } from "vitest";
import { peopleNavigationPath } from "@/components/hr/PeopleNavigation";

describe("People navigation routes", () => {
  it("selects each existing HR destination", () => {
    for (const path of ["/hr", "/hr/employees", "/hr/schedule", "/hr/leave", "/hr/payroll", "/hr/payroll/payables"]) {
      expect(peopleNavigationPath(path)).toBe(path);
    }
  });
  it("retains Employees context for employee profiles", () => {
    expect(peopleNavigationPath("/hr/employees/123")).toBe("/hr/employees");
  });
  it("selects Payroll Payables rather than its Payroll parent", () => {
    expect(peopleNavigationPath("/hr/payroll/payables")).toBe("/hr/payroll/payables");
  });
  it("does not select unrelated prefix matches", () => {
    expect(peopleNavigationPath("/hr-other")).toBeUndefined();
    expect(peopleNavigationPath("/hr/payroll-other")).toBeUndefined();
  });
});