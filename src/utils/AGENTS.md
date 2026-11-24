# Utils
- Home tiles use landingAccrual.ts: display-only accrual (pro-rated payroll/running costs, recipe theoretical stock + waste); booked figures win once posted.
- All create-user UI calls use invokeCreateUser for explicit session tokens and one same-identity retry on authentication rejection only, preventing duplicate mutations and uncaught session failures.
