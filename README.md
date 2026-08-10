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

Implementation is tracked in the [v1.0.0 milestone](https://github.com/suzutaku1014/reslot/milestone/1).
The live demo link and verified setup commands will be added before the v1.0.0
release.

## Design documents

- [Product brief](docs/product-brief.md)
- [Architecture](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [AI-assisted development](AI_USAGE.md)

## License

[MIT](LICENSE)
