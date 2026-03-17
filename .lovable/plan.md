

## Fix: Chinese Characters Corrupted in CSV Downloads

The issue is that Excel doesn't recognize UTF-8 encoding in CSV files without a BOM (Byte Order Mark). The current `downloadCSV` utility creates the blob without a BOM prefix, so Excel falls back to a legacy encoding and garbles Chinese characters.

### Root Cause
In `src/utils/csvDownload.ts`, the CSV is created as a plain `text/csv` blob. Excel requires a UTF-8 BOM (`\uFEFF`) prepended to the content to correctly interpret multibyte characters.

### Fix
**File: `src/utils/csvDownload.ts`** — Prepend the UTF-8 BOM character (`\uFEFF`) to the CSV string before creating the Blob:

```typescript
const csv = "\uFEFF" + header + "\n" + body;
```

This single-character addition tells Excel to interpret the file as UTF-8, preserving Chinese, Japanese, and all other non-ASCII characters correctly.

