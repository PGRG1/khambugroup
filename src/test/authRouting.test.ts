import { describe, expect, it } from "vitest";
import { resolveAuthRoute } from "@/utils/authRouting";

const session = { user: { id: "u1" } };

describe("post-auth routing", () => {
  it("sends signed-out visitors to the login page", () => {
    expect(resolveAuthRoute({ session: null, isPlatformAdmin: false })).toEqual({ kind: "redirect", to: "/auth" });
  });

  it("lets a normal signed-in user into the tenant app", () => {
    expect(resolveAuthRoute({ session, isPlatformAdmin: false })).toEqual({ kind: "allow" });
  });

  it("sends a platform admin with no entered client to the client list", () => {
    expect(resolveAuthRoute({ session, isPlatformAdmin: true, enteredTenantId: null })).toEqual({
      kind: "redirect",
      to: "/platform/clients",
    });
  });

  it("lets a platform admin who entered a client stay in the tenant app", () => {
    expect(resolveAuthRoute({ session, isPlatformAdmin: true, enteredTenantId: "t1" })).toEqual({ kind: "allow" });
  });

  it("never redirects a signed-in user back to /auth (no loop)", () => {
    for (const isPlatformAdmin of [true, false]) {
      for (const enteredTenantId of [null, "t1"]) {
        const d = resolveAuthRoute({ session, isPlatformAdmin, enteredTenantId });
        expect(d.kind === "redirect" ? d.to : "allow").not.toBe("/auth");
      }
    }
  });
});
