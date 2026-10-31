# Bani People actions

- Add People-only tools to both chats, with shared compact Confirm / Change / Cancel cards and linked outcomes.
- Reuse existing rota, leave, Team and payroll actions. Keep payroll approval exclusively on the owner’s Payroll button.
- Ask for ambiguous identities or periods. Leave drafts show balances; pay changes use the existing exact-instruction parser.
- Store drafts in existing pending actions. Confirm atomically rechecks access and unchanged records, executes once and logs the result.
- Offer safe, audited rota and leave undo only when records are unchanged and affected payroll is not approved.

## Choices
- Change cancels the old draft and returns its details to the composer for a fresh review.
- Team confirmation may submit for owner review rather than applying immediately, matching settings; authorized owners can confirm Team review in chat.
- Send rota records the existing sent status; it does not invent a message-delivery service.
- No pay advice, guessed cover person or guessed shift time; creating a week needs explicit shifts or copying saved shifts.

## Verification
- Add tests for ambiguity, explicit pay amounts, periods, operation restrictions and confirmation/undo safeguards.
- Check signed-in main and floating chat, confirm a reversible rota action, read it on Rota and undo it.
- Report approval roles, live payroll and real leave checks that cannot be safely exercised.