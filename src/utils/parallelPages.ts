/**
 * Reads every row of a paged (1,000-row) Supabase query, several pages at a time instead of one
 * after another. The first page is read alone (most lists fit in one page) unless `eager` is set
 * for lists that are known to be long; after that, pages are requested in waves of `wave`.
 * Reading stops at the first short page. The query must have a stable order (e.g. .order("id"))
 * so pages never overlap or skip rows. Rows come back in page order, as the one-at-a-time loop did.
 */
export async function parallelPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  { pageSize = 1000, wave = 6, eager = false }: { pageSize?: number; wave?: number; eager?: boolean } = {},
): Promise<T[]> {
  const out: T[] = [];
  let start = 0;
  let size = eager ? wave : 1;
  for (;;) {
    const results = await Promise.all(
      Array.from({ length: size }, (_, i) => build(start + i * pageSize, start + (i + 1) * pageSize - 1)),
    );
    for (const { data, error } of results) {
      if (error) throw error;
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < pageSize) return out;
    }
    start += size * pageSize;
    size = wave;
  }
}
