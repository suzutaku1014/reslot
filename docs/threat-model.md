# Threat model

## Protected assets

- Isolation between demo workspaces
- Integrity of appointment and request state
- Availability of the public demo within a bounded cost
- Vercel, Neon, GitHub, cron, and session secrets
- Audit evidence needed to explain administrative and asynchronous actions

## Primary threats and controls

| Threat | Control |
| --- | --- |
| Guessing another workspace resource ID | Server-side workspace scope on every query; return 404 |
| Customer invoking provider/admin actions | Persona and resource authorization in API middleware/services |
| Double decision or stale browser state | Version compare-and-swap and transactional locking |
| Provider double-booking | PostgreSQL overlap constraint plus conflict response |
| Duplicate form submission | Idempotency key unique within workspace and operation |
| Session theft | High-entropy token, hash at rest, secure HTTP-only cookie, one-hour expiry |
| CSRF | SameSite cookie and exact Origin verification for unsafe methods |
| Public-demo abuse | Session/mutation quotas, atomic rate limits, bounded input, automatic cleanup |
| Outbox duplicate delivery | Deterministic dedupe key and atomic worker claim |
| Secret or personal-data leakage | No real PII fields, redacted structured logs, secret scanning |
| SSRF or malicious attachment | No server-side URL fetch and no uploads in v1 |

## Not claimed

This document defines the v1 scope; it does not claim that the system is
universally secure. Cloud account configuration, provider retention, backup,
and production observations must be verified separately before release.
