# Verification strategy

| Layer | Purpose | Command |
| --- | --- | --- |
| Static | Formatting, unsafe patterns, types | `pnpm lint && pnpm type-check` |
| Unit | API contract and UI state | `pnpm test` |
| Integration | Real PostgreSQL transactions and overlap behavior | `pnpm test:integration` |
| Browser | Customer → Provider → Admin story | `pnpm test:e2e` |
| Build | Next.js production compilation | `pnpm build` |

CI provisions disposable PostgreSQL 17, applies the committed migration, and runs
all layers. The concurrency test deliberately races two provider decisions and
asserts that only one commits. The migration adds a PostgreSQL exclusion
constraint so correctness does not depend solely on an application-level query.
