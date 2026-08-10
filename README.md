# ReSlot

ReSlot is a production-minded reference application for appointment
rescheduling. A customer proposes new times, the assigned provider accepts or
rejects the request, and an administrator can inspect delivery failures and an
append-only audit trail.

The public demo uses expiring fictional workspaces. It does not collect real
names, email addresses, payment information, or third-party credentials.

## Portfolio goals

- Show one complete workflow across UI, API, PostgreSQL, and asynchronous work.
- Make authorization, concurrency, idempotency, and failure recovery visible.
- Publish the engineering controls used to test and release the application.
- Keep the demo safe to operate anonymously on the public internet.

## Roles

| Role | Capability |
| --- | --- |
| Customer | View appointments and propose one to three replacement times |
| Provider | Review assigned requests and accept one candidate or reject the request |
| Admin | Inspect all requests, audit events, and notification delivery state |

## Status

Try the fictional-data demo at [reslot-eight.vercel.app](https://reslot-eight.vercel.app).
Release work is tracked in the
[v1.0.0 milestone](https://github.com/suzutaku1014/reslot/milestone/1).

## Stack

Next.js 16 and React 19 render the application. Hono owns same-origin HTTP
contracts, Prisma 7 owns persistence, and Neon PostgreSQL enforces tenant and
time-overlap boundaries. Vercel runs the web process and scheduled outbox
maintenance. No external identity or messaging provider is required for v1.

## Local verification

Requirements are Node.js 24, pnpm 11, and PostgreSQL 17. Copy the variable names
from `.env.example`, use local-only values, and point both database URLs at a
disposable local database.

```bash
pnpm install
pnpm db:deploy
pnpm lint
pnpm type-check
pnpm test
pnpm test:integration
pnpm test:e2e
```

Do not enter real personal data. Each browser demo creates fictional records and
becomes inaccessible after one hour.

## Design documents

- [Product brief](docs/product-brief.md)
- [Architecture](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Verification strategy](docs/testing.md)
- [Operations runbook](docs/operations.md)
- [Release checklist](docs/release-checklist.md)
- [AI-assisted development](AI_USAGE.md)

## License

[MIT](LICENSE)
