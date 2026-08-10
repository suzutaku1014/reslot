# Repository working agreement

## Product boundary

ReSlot implements one appointment-rescheduling workflow for fictional demo
personas. Do not add payments, arbitrary webhooks, file uploads, real personal
data, or third-party messaging to v1.

## Engineering rules

- Keep business transitions in domain services, not React event handlers.
- Scope every business query by the authenticated demo workspace.
- Enforce resource authorization in the API even when the UI hides an action.
- Make writes idempotent and protect stale transitions with a version check.
- Commit business state, outbox intent, and audit evidence atomically.
- Never log cookies, tokens, request bodies, or notification payloads.
- Use fictional data in local, Preview, test, and Production demo environments.
- Treat missing credentials and unverifiable evidence as failures, not passes.

## Verification

Start with the narrowest relevant test. Before merging a feature PR, run lint,
type-check, affected tests, and `git diff --check`. Database concurrency changes
require the real-PostgreSQL integration suite.
