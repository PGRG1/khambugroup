# Unblock Lovable AI Gateway usage

## Goal
Restore AI features such as invoice scanning and classification without changing application behavior or accounting data.

## Plan
1. Disable the currently triggered workspace AI Gateway block limit, which is stopping requests despite the workspace having remaining credits.
2. Keep the existing application error handling so future gateway failures surface their actual status/message instead of the opaque `ai_gateway_403` label.
3. Retry an AI classification request from the app and verify that the function no longer returns the credit-limit 403.
4. If the request still fails, inspect the new gateway response and address that specific error without bypassing billing or exposing credentials.

## Expected result
AI Gateway calls can run against the workspace’s remaining credit balance. The current credit-limit block is removed; no database schema, invoice logic, or frontend calculation changes are required.