const MODULES: [string, string][] = [
  ["/finance-team", "Finance Team"], ["/revenue", "Revenue"], ["/sales-data", "Revenue"], ["/forecast", "Revenue"],
  ["/procurement", "Procurement"], ["/finance", "Finance"], ["/pl-report", "Finance"], ["/bank", "Bank"],
  ["/expenses", "Expenses"], ["/payments", "Payments"], ["/petty-cash", "Petty Cash"], ["/staff-reimbursements", "Reimbursements"],
  ["/hr", "People"], ["/kpis", "KPIs"], ["/notifications", "Notifications"], ["/activity-log", "Activity Log"],
  ["/settings", "Settings"], ["/admin", "Admin"], ["/user-access", "User Access"],
];

/** Truthful module label for a tenant path; never invents a record or venue. */
export function moduleLabel(pathname: string): string {
  if (pathname === "/" || pathname === "") return "Home";
  const hit = MODULES.find(([root]) => pathname === root || pathname.startsWith(`${root}/`) || pathname.startsWith(`${root}-`));
  return hit ? hit[1] : "Portal";
}

export const ATTACH_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ATTACH_MAX_FILES = 3;
export const ATTACH_MAX_BYTES = 4 * 1024 * 1024;
export const ATTACH_MAX_TOTAL = 8 * 1024 * 1024;

/** Returns an error for a file that cannot be attached, given current attachments. */
export function attachmentError(file: { name: string; type: string; size: number }, existing: { size: number }[]): string | null {
  if (!ATTACH_TYPES.includes(file.type)) return `${file.name}: only JPEG, PNG, WebP or PDF can be read.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > ATTACH_MAX_BYTES) return `${file.name} is larger than 4 MB.`;
  if (existing.length >= ATTACH_MAX_FILES) return `Attach up to ${ATTACH_MAX_FILES} files.`;
  if (existing.reduce((n, f) => n + f.size, 0) + file.size > ATTACH_MAX_TOTAL) return "Attachments exceed 8 MB in total.";
  return null;
}

export type Point = { x: number; y: number };
export const clampPoint = (p: Point, size: number, w: number, h: number, margin = 8): Point => ({
  x: Math.min(Math.max(margin, p.x), Math.max(margin, w - size - margin)),
  y: Math.min(Math.max(margin, p.y), Math.max(margin, h - size - margin)),
});
/** Sphere (top-left + size) overlaps dismiss target centred at (cx, cy) with radius r. */
export const overDismiss = (p: Point, size: number, cx: number, cy: number, r = 44) =>
  Math.hypot(p.x + size / 2 - cx, p.y + size / 2 - cy) < r + size / 2 - 8;
/** Sphere gesture: a press shorter than holdMs without movement is a tap. */
export const isTap = (moved: number, heldMs: number, holdMs = 320) => moved < 8 && heldMs < holdMs;
