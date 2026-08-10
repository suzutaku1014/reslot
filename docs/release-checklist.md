# Release checklist

## Before merge

- The milestone contains an issue for every material change.
- Pull requests explain risk, rollback, and validation.
- CI, CodeQL, dependency review, and Vercel Preview are green.
- The migration has been applied to an isolated database branch.
- The browser flow passes without real personal data.

## Production candidate

- Production environment contains `DATABASE_URL`, `DIRECT_URL`,
  `SESSION_PEPPER`, `CRON_SECRET`, and `PUBLIC_APP_URL`.
- Secrets differ from Preview and Local and are never copied into the repository.
- `prisma migrate deploy` succeeds before application traffic uses the schema.
- Health, demo issuance, role switching, rescheduling, delivery, and audit views
  pass a production smoke test.
- Security headers and secure cookie attributes are confirmed in the browser.

## Publish

- Merge through the protected `main` branch.
- Tag the exact reviewed commit as `v1.0.0`.
- Create release notes from the changelog and link the live demo.
- Watch deployment and function logs for the first maintenance interval.
- Close the milestone only after the tagged production deployment is healthy.
