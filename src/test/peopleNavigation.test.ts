import { describe, expect, it } from "vitest";
import { peopleNavigationPath } from "@/components/hr/PeopleNavigation";

describe("People navigation routes", () => {
  it("selects each existing HR destination", () => {
    for (const path of ["/hr/employees", "/hr/schedule", "/hr/payroll"]) {
      expect(peopleNavigationPath(path)).toBe(path);
    }
  });
  it("retains Employees context for employee profiles", () => {
    expect(peopleNavigationPath("/hr/employees/123")).toBe("/hr/employees");
  });
  it("selects Payroll Payables rather than its Payroll parent", () => {
    expect(peopleNavigationPath("/hr/payroll/payables")).toBeUndefined();
    expect(peopleNavigationPath("/hr")).toBe("/hr/employees");
    expect(peopleNavigationPath("/hr/leave")).toBe("/hr/schedule");
  });
  it("does not select unrelated prefix matches", () => {
    expect(peopleNavigationPath("/hr-other")).toBeUndefined();
    expect(peopleNavigationPath("/hr/payroll-other")).toBeUndefined();
  });
});