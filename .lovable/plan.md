## Stop extracting pack_size in invoice parser; hide it in detail drawer

### supabase/functions/parse-invoice/index.ts
1. Delete the bullet in extraction instructions:
   `- "pack_size" field: translate Chinese size units (e.g. "3.8公升/桶" → "3.8L/Bucket"...)`
2. In the JSON schema, replace the `pack_size` field definition with:
   `"pack_size": "always return empty string \"\" — do not extract size info here, keep the full product name including size in the description field"`
3. Remove from post-processing:
   `if (li.pack_size) li.pack_size = translateChinese(li.pack_size);`
4. Remove `"pack_size"` from the `allowedLineFields` Set.
5. Remove `pack_size` from the reviewer schema properties.

### src/components/procurement/ProcurementInvoicesTab.tsx
1. Remove from the detail drawer line items list:
   `{line.pack_size && <span className="ml-1 text-muted-foreground">[{line.pack_size}]</span>}`

### Preserved
- Existing `pack_size: ""` lines in keg mapping logic
- `pack_size` field across interfaces, save payloads, and the DB column (historical data retained)
- All other logic in both files
