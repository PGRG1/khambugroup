import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  getDateContext,
  validateChatRequest,
} from "../../supabase/functions/_shared/assistantPrompt";

describe("validateChatRequest", () => {
  it("accepts user/assistant messages and tenant_id", () => {
    const r = validateChatRequest({
      messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
      tenant_id: " t1 ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tenantId).toBe("t1");
      expect(r.messages).toHaveLength(2);
    }
  });

  it("rejects client-supplied system or tool roles", () => {
    for (const role of ["system", "tool", "developer"]) {
      const r = validateChatRequest({ messages: [{ role, content: "x" }] });
      expect(r.ok).toBe(false);
      expect(r.ok === false ? r.error : "").toMatch(/user' or 'assistant/);
    }
  });

  it("rejects non-array, empty, over-long history and over-long message", () => {
    expect(validateChatRequest({ messages: "nope" }).ok).toBe(false);
    expect(validateChatRequest({ messages: [] }).ok).toBe(false);
    const many = Array.from({ length: 41 }, () => ({ role: "user", content: "a" }));
    expect(validateChatRequest({ messages: many }).ok).toBe(false);
    const long = validateChatRequest({ messages: [{ role: "user", content: "a".repeat(8001) }] });
    expect(long.ok).toBe(false);
  });
});

describe("getDateContext", () => {
  it("computes today, MTD span and comparable prior-month span per request", () => {
    const ctx = getDateContext(new Date("2026-03-15T02:00:00Z"), "Asia/Hong_Kong");
    expect(ctx.today).toBe("2026-03-15");
    expect(ctx.month_start).toBe("2026-03-01");
    expect(ctx.month_elapsed_days).toBe(15);
    expect(ctx.prior_month_start).toBe("2026-02-01");
    expect(ctx.prior_month_same_span_end).toBe("2026-02-15");
    expect(ctx.year_start).toBe("2026-01-01");
  });

  it("clamps the prior-month span to the shorter month", () => {
    const ctx = getDateContext(new Date("2026-03-31T02:00:00Z"), "Asia/Hong_Kong");
    expect(ctx.prior_month_same_span_end).toBe("2026-02-28");
  });

  it("uses Hong Kong local date, not UTC", () => {
    const ctx = getDateContext(new Date("2026-03-14T17:30:00Z"), "Asia/Hong_Kong");
    expect(ctx.today).toBe("2026-03-15");
  });
});

describe("buildSystemPrompt", () => {
  const dates = getDateContext(new Date("2026-03-15T02:00:00Z"));

  it("includes resolved date context and no hardcoded client roster", () => {
    const p = buildSystemPrompt(dates, { workspaceName: "Acme", venues: ["Bar One"] });
    expect(p).toContain("2026-03-15");
    expect(p).toContain("2026-02-15");
    expect(p).toContain("Acme");
    expect(p).toContain("Bar One");
    expect(p).not.toMatch(/KHAMBU/i);
    expect(p).not.toMatch(/Assembly, Caliente/);
  });

  it("labels the invoice-spend proxy and forbids calling it COGS or margin", () => {
    const p = buildSystemPrompt(dates);
    expect(p).toMatch(/INVOICE-SPEND-TO-REVENUE PROXY/);
    expect(p).toMatch(/not cost of goods sold, gross margin or net margin/i);
    expect(p).toMatch(/Missing data is UNKNOWN/);
    expect(p).toMatch(/forecast and actual separately/i);
  });

  it("does not mandate recommendations on every answer", () => {
    const p = buildSystemPrompt(dates);
    expect(p).toMatch(/Recommendations are optional/);
    expect(p).not.toMatch(/Always recommend/);
  });

  it("tells the model to discover venues when none are known", () => {
    const p = buildSystemPrompt(dates, { venues: [] });
    expect(p).toMatch(/Do not assume any venue names/);
  });
});
