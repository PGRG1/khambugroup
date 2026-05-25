## Plan to fix the Invoice Scanner

1. **Stabilize the parse-invoice backend function**
   - Add safer AI response parsing so markdown-wrapped or partially embedded JSON does not crash the scan.
   - Detect truncated AI responses and return a clean scanner error instead of a generic Edge Function failure.
   - Ensure every failure path returns JSON with CORS headers so the frontend can show a useful message.

2. **Reduce likely request timeouts/fetch failures**
   - Keep Agent 1 extraction working first, then make Agent 2 non-blocking.
   - If Agent 2 review fails, return the extracted invoice with a warning instead of failing the entire scanner.
   - Add lightweight timing/log markers around Agent 1, verification, and Agent 2 so future failures can be identified from logs.

3. **Fix frontend error handling**
   - Update `InvoiceScanner.tsx` to read backend error payloads from function responses where possible.
   - Show a specific toast such as AI timeout, invalid extraction JSON, or review agent unavailable instead of only “Edge Function returned a non-2xx status code”.

4. **Keep the existing UI and workflow intact**
   - No new tables.
   - No procurement redesign.
   - Keep existing supplier dropdown, Items Master matching, line-item table, save flow, and item creation flow.

5. **Validation after changes**
   - Check the edited scanner and edge-function code for syntax/logic issues.
   - Deploy the updated `parse-invoice` function if build mode allows deployment.