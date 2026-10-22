export type RevenueSection = "overview" | "analysis" | "targets" | "sales" | "setup";

const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export function isRevenueRoute(path: string): boolean {
  return ["/revenue", "/sales-data", "/forecast", "/forecast-legacy"].some(root => within(path, root));
}

export function revenueSection(path: string): RevenueSection | null {
  if (path === "/revenue") return "overview";
  if (within(path, "/revenue/analysis")) return "analysis";
  if (within(path, "/sales-data")) return "sales";
  if (path === "/revenue/targets-new" || within(path, "/forecast") || within(path, "/forecast-legacy")) return "targets";
  if (within(path, "/revenue/setup")) return "setup";
  return null;
}

export function revenueLanding(revenue: boolean, forecast: boolean): string | null {
  return revenue ? "/revenue" : forecast ? "/revenue/targets-new" : null;
}

export function detailedTargetsPath(path: string): string | null {
  const match = /^\/forecast(?:-legacy)?\/([^/]+)\/?$/.exec(path);
  return match ? `/forecast/${match[1]}` : null;
}

export function retainCurrentQuery(destination: string, pathname: string, search: string): string {
  return destination === pathname ? destination + search : destination;
}

export function revenuePageAllowed(isAdmin: boolean, isPreviewActive: boolean, canAccess: boolean): boolean {
  return (isAdmin && !isPreviewActive) || canAccess;
}