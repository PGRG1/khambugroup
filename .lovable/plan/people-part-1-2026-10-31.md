# People — Part 1

## What will change
- One People section: **Team**, **Rota & hours**, **Payroll**, with the requested redirects and shared phone pills. Remove Overview from the menu.
- New admin **Settings → People**: Company defaults and active-venue overrides, with every requested control. Existing tenants receive the exact defaults in your brief without deleting records.
- Rebuild **Team** using the Invoices/Stock pattern: People title, Add someone, Today summary, Working/Left, filters, search, download and a clean phone-friendly table.
- Add approval-only venue correction suggestions and an Ask box for new starters and effective-dated employment changes.
- Open each person in a centred profile with **Details · Pay · Leave · Shifts · Documents · History**. Preserve existing profile information and related workflows.
- Add private, versioned documents, reviewed contract extraction, expiry warnings from 60 days before expiry, and author/approver/evidence in employment history.

## Choices and boundaries
- **Working** includes active and on-leave people; **Left** includes resigned and terminated people. Future starters show their start date and do not count as working before it.
- Use the existing portal venue picker; Team’s venue filter controls that same scope rather than introducing another selection. Invalid venue entries remain visible for correction.
- **Owner** means a tenant-scoped, server-validated Owner position—not simply an admin or a browser choice.
- **Owner-run:** an owner confirming their own change applies it immediately; everyone else submits for owner approval. **Managed:** owner approval is required, including owner-authored requests. **Strict:** owner approval must come from a different person. If no eligible approver exists, the change remains pending.
- Venue settings override individual Company values and can revert to inheritance. For a cross-venue view, show enabled capabilities but enforce each person’s applicable settings when acting.
- New contract versions preserve old files. Extraction never changes employment terms without confirmation and the same approval rules. Documents remain visible only to owners and managers with explicit document permission; general People access is insufficient.
- Expiry reminders appear in Team/profile for current documents within 60 days, including overdue documents. No email or staff-app delivery is added in this part.
- Rota and Payroll layouts, posting and settlement remain unchanged. Minimal shared feature gating and effective-date calculation integration are included because disabled features and historical pay/leave cannot otherwise behave as requested. Staff-app/clock-in settings govern existing entry points; this part does not build a new staff app or clock-in experience.

## Technical implementation
- Reuse PeopleNavigation, AppLayout, kit controls, useVenueScope and effective-user permission patterns. Keep existing route authorization unless a narrowly required permission correction is justified and verified.
- Add tenant/venue People settings, employee-change approval records, document metadata and dated employment terms with explicit grants and RLS. Extend hr_employee_history with approval/evidence linkage while preserving existing rows.
- Use controlled transactional operations for confirm/approve, enforcing settings, ownership, dates and allowed fields on the server. Future-approved terms become effective on their date without rewriting older payroll or leave records.
- Share deterministic date-based term resolution and change-impact calculations between profile previews and existing pay/leave consumers. Do not invent past rates: legacy periods without evidence retain existing saved values.
- Store documents in a private bucket with tenant/person/version paths and restricted access. New AI work drafts structured suggestions only; validate files, tenant context and returned fields, and retain source evidence.

## Verification
- Tests for all default settings, inheritance, disabled capability gates, approval modes, dated rates/leave, 60-day reminders, immutable document versions and proposed-only AI output.
- Signed-in desktop/phone checks of navigation, Team filtering, profile tabs and centred dialogs with no sideways page scrolling.
- Exercise join/change/venue approval and document upload→extraction→confirm→read-back using removable test records. Verify owner/permitted-manager access and denied access where test accounts allow it.
- Report precisely what passed and what remains unverified, especially real contract accuracy, non-owner sessions and existing Rota/Payroll regression coverage.