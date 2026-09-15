/**
 * Post-authentication routing decision, shared by the route guards so /auth and /
 * can never disagree and ping-pong.
 */

export interface AuthRouteInput {
  session: unknown | null;
  isPlatformAdmin: boolean;
  /** Tenant the platform admin has explicitly entered, if any. */
  enteredTenantId?: string | null;
}

export type AuthRouteDecision =
  | { kind: "redirect"; to: "/auth" | "/platform/clients" }
  | { kind: "allow" };

export function resolveAuthRoute({ session, isPlatformAdmin, enteredTenantId }: AuthRouteInput): AuthRouteDecision {
  if (!session) return { kind: "redirect", to: "/auth" };
  if (isPlatformAdmin && !enteredTenantId) return { kind: "redirect", to: "/platform/clients" };
  return { kind: "allow" };
}
