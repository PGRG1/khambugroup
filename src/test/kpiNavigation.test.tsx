import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KpiNavigation } from "@/components/kpi/KpiNavigation";

const state = vi.hoisted(() => ({ canPlan: false, canConfigure: false, isGlobalAdmin: false, canAccess: true }));
vi.mock("@/hooks/useKpiCapability", () => ({ useKpiCapability: () => ({ ...state, userId: "preview-user", loading: false }) }));
vi.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => ({ canAccessPage: () => state.canAccess, loading: false }) }));
afterEach(() => {
  cleanup();
  Object.assign(state, { canPlan: false, canConfigure: false, isGlobalAdmin: false, canAccess: true });
});
const open = () => render(<MemoryRouter initialEntries={["/kpis/my-cards"]}><KpiNavigation /></MemoryRouter>);

describe("KPI navigation access", () => {
  it("limits view-only users to their KPI destination", () => {
    open();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/kpis/my-cards"]);
  });
  it("adds Planner for canPlan without exposing Setup", () => {
    state.canPlan = true;
    open();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/kpis/my-cards", "/kpis/planner"]);
  });
  it("adds Setup only for canConfigure", () => {
    state.canPlan = true;
    state.canConfigure = true;
    open();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/kpis/my-cards", "/kpis/planner", "/kpis/setup"]);
  });
  it("does not bypass denied effective-user access when previewing", () => {
    state.canAccess = false;
    open();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});