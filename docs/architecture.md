# Architecture

```text
Browser
  -> Next.js App Router
  -> same-origin /api route
  -> Hono API
  -> domain services
  -> Prisma
  -> Neon PostgreSQL

Vercel Cron
  -> authenticated internal Hono route
  -> atomic outbox claim
  -> in-app notification adapter
```

ReSlot is a modular monolith. The browser never connects directly to the
database. Next.js and Hono run in one deployment and share typed domain and
contract packages without creating a second network service.

## Trust boundaries

- A random demo-session token is stored only in a secure, HTTP-only cookie.
- Only the token hash is persisted.
- The API resolves the active persona and workspace from the session; actor and
  workspace identifiers are never trusted from request bodies.
- Every business table carries a workspace identifier, and relations preserve
  that scope.
- Provider-time conflicts are enforced at the PostgreSQL boundary in addition
  to application validation.
- External effects are represented by an outbox row committed with business
  state and delivered after commit.

## Deployment environments

- Local uses fictional seed data in a local PostgreSQL database.
- Each pull request uses an isolated Preview deployment and database branch.
- Production is a public, fictional-data demo with short-lived workspaces.
- Production credentials and data are never copied to Local or Preview.
