/**
 * Where each "What we did" row opens: the exact record when its screen accepts one, otherwise the
 * screen that holds it (never a retired route that bounces back to Home). `page`/`admin` say which
 * access the destination needs, so rows the person cannot open are shown as plain text.
 */
export type WorkLink = { to: string; page?: string; admin?: boolean };

export type WorkLinkSource =
  | { kind: "invoice"; id: string }
  | { kind: "sales"; id: string }
  | { kind: "bill"; id: string }
  | { kind: "bank"; id: string }
  | { kind: "payroll_accrual"; month: string }
  | { kind: "depreciation"; month: string };

export function workLink(src: WorkLinkSource): WorkLink {
  switch (src.kind) {
    // Invoices open in their review drawer through the existing ?invoice= deep link.
    case "invoice": return { to: `/procurement/invoices?invoice=${encodeURIComponent(src.id)}`, page: "invoices" };
    case "sales": return { to: `/sales-data/${encodeURIComponent(src.id)}`, page: "revenue" };
    // Bills and bank lines have no record deep link yet: open the screen that lists them.
    case "bill": return { to: "/expenses/bills", admin: true };
    case "bank": return { to: "/finance/cash?view=transactions&filter=all", admin: true };
    case "payroll_accrual": return { to: "/hr/payroll", page: "people" };
    case "depreciation": return { to: `/finance/close?month=${src.month.slice(0, 7)}`, admin: true };
  }
}

/** Whether this person can open the link (same rules as the route guards). */
export function canOpen(
  link: WorkLink | null | undefined,
  access: { isAdmin: boolean; isPreviewActive: boolean; canAccessPage: (page: string) => boolean },
): boolean {
  if (!link) return false;
  // AdminRoute: admins only. ProtectedRoute: page permission, which admins skip unless previewing someone.
  if (link.admin && !access.isAdmin) return false;
  if (link.page && (!access.isAdmin || access.isPreviewActive) && !access.canAccessPage(link.page)) return false;
  return true;
}
