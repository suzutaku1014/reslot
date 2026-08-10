# Operations runbook

## Service objectives

- The public demo should return a successful health response in 99.5% of monthly checks.
- A queued in-app notification should be delivered within two cron intervals.
- No demo workspace should remain beyond its one-hour lifetime plus one cleanup interval.

These are portfolio targets, not a commercial SLA. Vercel availability, Neon limits,
and the absence of an external pager constrain the guarantee.

## Signals

The admin workspace exposes request, outbox, attempt, dead-letter, and audit state.
Every API response carries `X-Request-Id`; mutations persist it in the audit trail.
Vercel function logs are searched by request ID. Database health is checked through
`GET /api/health` plus a synthetic demo flow.

## Delivery recovery

1. Confirm the business transaction committed in the audit trail.
2. Inspect the event error code and attempt count.
3. Correct the payload or runtime fault before retrying a dead-letter event.
4. Use the workspace-scoped Admin retry action.
5. Verify exactly one in-app notification and a `DELIVERED` outbox state.

Never reverse an accepted appointment merely because its notification failed.

## Deployment and rollback

Pull requests must pass CI and a Vercel Preview before merge. Production deploys
from `main`. For an application regression, promote the last healthy Vercel
deployment and open a follow-up fix. Database migrations are forward-only; a
destructive schema change requires an expand/migrate/contract sequence and a
tested data backup. Do not roll application code behind an incompatible schema.

## Data lifecycle

Demo sessions contain fictional names only. The hourly maintenance job deletes
expired sessions; database cascades remove their workspaces, appointments,
requests, notifications, idempotency rows, outbox rows, and audit rows.
