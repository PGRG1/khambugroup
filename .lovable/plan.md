## Edit `src/utils/productMasterResolver.ts`

In both `resolveProductMatch` and `resolveExactMatch`, locate the final internal_sku fallback:

```ts
const byInternal = products.find(p => p.internal_sku === internalSku);
if (byInternal) return byInternal;
```
and
```ts
const m = products.find(p => p.internal_sku === internalSku);
if (m) return m;
```

Replace each with:

```ts
const allForSku = products.filter(p => p.internal_sku === internalSku);
if (allForSku.length === 1) return allForSku[0];
```

This makes the internal_sku fallback only return a match when exactly one PM entry shares that internal_sku, avoiding ambiguous hydration when multiple supplier rows share it. No other files or logic touched.