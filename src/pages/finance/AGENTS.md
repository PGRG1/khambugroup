# Finance rules
- Reports use financeReportViews/FinanceAging for read-only balances, due terms and capped payment proposals; ManagementReports retains typed adjustments.
- Schedule settings and deferred items are tenant-scoped, RPC-written; finance_entry_drafts is read-only to clients. Explicit expense_month_approve selections own schedule posting, with current source and closed-period rechecks; page loads never prepare or post.
- Month close uses server snapshots and append-only explanations; triggers require completeness and block unexplained/matching/correction exceptions. Guarded actions own writes.
- PeriodControl/periodWindow owns Finance date windows and session selections; useBooksWindow resolves Accounting configuration and tax year, and Finance checks only request bounded months so malformed journal dates never create menu years or extra checks.
