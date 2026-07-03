/**
 * Revenue Targets mutation-flow tests.
 * These tests exercise validation, state transitions and reason-required flows
 * without hitting the live database. They mock the Supabase client and assert
 * the mutation hooks send the correct payloads and gate on the right rules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { validateManagerLine } from "@/hooks/useRevenueTargetMutations";
import type { ManagerTargetLine } from "@/types/revenueTargetsV2";

// ----- Supabase + tenant mocks -----
const rpcMock = vi.fn();
const updateEqMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn(() => ({
  eq: (_col: string, _v: any) => ({ eq: (_c2: string, _v2: any) => updateEqMock() }),
}));

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: () => ({
        insert: (payload: any) => { insertMock(payload); return Promise.resolve({ error: null }); },
        update: updateMock,
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
            }),
          }),
        }),
      }),
      rpc: (name: string, args: any) => { rpcMock(name, args); return Promise.resolve({ data: "new-event-id", error: null }); },
    },
  };
});

vi.mock("@/hooks/useActiveTenant", () => ({
  useActiveTenant: () => ({ tenantId: "tenant-x" }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

// Import after mocks so the hook wires the mocked client.
import { useRevenueTargetMutations } from "@/hooks/useRevenueTargetMutations";

const T = "tenant-x";
const V = "venue-1";

function makeLine(over: Partial<ManagerTargetLine> = {}): ManagerTargetLine {
  return {
    id: "line-1",
    tenantId: T,
    venueId: V,
    targetDate: "2026-05-15",
    lineType: "service_period",
    servicePeriodId: "sp-1",
    eventName: null, eventType: null, eventMode: null, replacesServicePeriodId: null,
    venueArea: null, eventStartTime: null, eventEndTime: null,
    targetInputMode: "drivers",
    managerGuestTarget: 100,
    managerSpendPerGuestTarget: 50,
    managerRevenueOverride: null,
    managerRevenueTarget: 5000,
    lineStatus: "operating",
    zeroReason: null,
    managerSource: null,
    status: "draft",
    notes: null,
    ...over,
  };
}

beforeEach(() => {
  rpcMock.mockClear();
  insertMock.mockClear();
  updateMock.mockClear();
  updateEqMock.mockClear();
  updateEqMock.mockResolvedValue({ error: null });
});

/* ========== VALIDATION ========== */

describe("validateManagerLine", () => {
  it("draft target skips driver validation", () => {
    expect(validateManagerLine(makeLine({ managerGuestTarget: null }), "draft")).toBeNull();
  });

  it("saved target requires guest + spg drivers", () => {
    expect(validateManagerLine(makeLine({ managerGuestTarget: null }), "saved")).toMatch(/required/i);
    expect(validateManagerLine(makeLine({ managerSpendPerGuestTarget: null }), "saved")).toMatch(/required/i);
  });

  it("saved contracted line requires managerRevenueOverride", () => {
    const l = makeLine({ targetInputMode: "contracted_revenue", managerRevenueOverride: null });
    expect(validateManagerLine(l, "saved")).toMatch(/contracted/i);
  });

  it("not-operating lines skip driver validation on save", () => {
    const l = makeLine({ lineStatus: "not_operating", managerGuestTarget: null, managerSpendPerGuestTarget: null });
    expect(validateManagerLine(l, "saved")).toBeNull();
  });
});

/* ========== MUTATION HOOK ========== */

describe("useRevenueTargetMutations — draft Manager save", () => {
  it("draft save (via upsertManagerLine w/o id) inserts a draft row", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      const r = await result.current.upsertManagerLine({
        venueId: V, targetDate: "2026-05-15", lineType: "service_period",
        servicePeriodId: "sp-1", managerGuestTarget: 100, managerSpendPerGuestTarget: 50,
        status: "draft",
      });
      expect(r.ok).toBe(true);
    });
    expect(insertMock).toHaveBeenCalledOnce();
    const payload = (insertMock.mock.calls[0] as any)[0];
    expect(payload.status).toBe("draft");
    expect(payload.tenant_id).toBe(T);
    expect(payload.manager_guest_target).toBe(100);
  });
});

describe("useRevenueTargetMutations — approval transition", () => {
  it("approveLines updates the requested ids to status=approved", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      const r = await result.current.approveLines(["a", "b"]);
      expect(r.ok).toBe(true);
    });
    expect(updateMock).toHaveBeenCalledOnce();
    expect((updateMock.mock.calls[0] as any)[0]).toEqual({ status: "approved" });
  });
});

describe("useRevenueTargetMutations — additive event", () => {
  it("passes replaces_service_period_id=null when mode=additive", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      await result.current.addEventWithReplacement({
        venueId: V, targetDate: "2026-05-15",
        eventName: "Brand launch", eventMode: "additive",
        managerGuestTarget: 200, managerSpendPerGuestTarget: 800,
      });
    });
    expect(rpcMock).toHaveBeenCalledOnce();
    const [, args] = (rpcMock.mock.calls[0] as any);
    expect(args.p_event_mode).toBe("additive");
    expect(args.p_replaces_service_period_id).toBeNull();
  });
});

describe("useRevenueTargetMutations — replacement event (atomic)", () => {
  it("passes replaces_service_period_id and mode=replaces_period to the atomic RPC", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      const r = await result.current.addEventWithReplacement({
        venueId: V, targetDate: "2026-05-15",
        eventName: "Corporate dinner", eventMode: "replaces_period",
        replacesServicePeriodId: "sp-dinner",
        managerGuestTarget: 120, managerSpendPerGuestTarget: 1500,
        notes: "Contracted buyout",
      });
      expect(r.ok).toBe(true);
    });
    expect(rpcMock).toHaveBeenCalledWith("add_revenue_event_with_replacement", expect.objectContaining({
      p_event_mode: "replaces_period",
      p_replaces_service_period_id: "sp-dinner",
      p_notes: "Contracted buyout",
    }));
  });

  it("does not fall back to individual upserts when the RPC succeeds", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      await result.current.addEventWithReplacement({
        venueId: V, targetDate: "2026-05-15", eventName: "X",
        eventMode: "replaces_period", replacesServicePeriodId: "sp-dinner",
      });
    });
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("useRevenueTargetMutations — events-only event", () => {
  it("passes p_event_mode=events_only through the RPC", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      await result.current.addEventWithReplacement({
        venueId: V, targetDate: "2026-05-15",
        eventName: "Charity night", eventMode: "events_only",
        managerGuestTarget: 80, managerSpendPerGuestTarget: 1200,
      });
    });
    expect(((rpcMock.mock.calls[0] as any) as any)[1].p_event_mode).toBe("events_only");
  });
});

describe("useRevenueTargetMutations — Not Operating and reactivation", () => {
  it("Not Operating writes lineStatus=not_operating and preserves zeroReason", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      await result.current.upsertManagerLine({
        id: "line-1", venueId: V, targetDate: "2026-05-15", lineType: "service_period",
        servicePeriodId: "sp-1", lineStatus: "not_operating",
        zeroReason: "Deep clean scheduled",
      });
    });
    expect(updateMock).toHaveBeenCalledOnce();
    const patch = (updateMock.mock.calls[0] as any)[0];
    expect(patch.line_status).toBe("not_operating");
    expect(patch.zero_reason).toBe("Deep clean scheduled");
  });

  it("Reactivate writes lineStatus=operating and clears zeroReason", async () => {
    const { result } = renderHook(() => useRevenueTargetMutations());
    await act(async () => {
      await result.current.upsertManagerLine({
        id: "line-1", venueId: V, targetDate: "2026-05-15", lineType: "service_period",
        servicePeriodId: "sp-1", lineStatus: "operating",
        zeroReason: null,
      });
    });
    const patch = (updateMock.mock.calls[0] as any)[0];
    expect(patch.line_status).toBe("operating");
    expect(patch.zero_reason).toBeNull();
  });
});
