/** Never retain previous data across a user, tenant, or preview boundary. */
export function sameSessionPrevious<T>(data: T | undefined, previous: { queryKey: readonly unknown[] } | undefined, key: readonly unknown[]) {
  return previous && JSON.stringify(previous.queryKey) === JSON.stringify(key) ? data : undefined;
}
export const sessionQueryTiming = { staleTime: 60_000, gcTime: 30 * 60_000 };