# Utils
- Home tiles use landingAccrual.ts: display-only accrual (pro-rated payroll/running costs, recipe theoretical stock + waste); booked figures win once posted.
- Chunk recovery must never cancel Vite preload errors: cancellation resolves failed imports as undefined and crashes React lazy initialization.
