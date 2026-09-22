# QuizFlow

Hebrew quiz builder and public quiz runtime, built with Next.js and Supabase.

## Development

Install dependencies with `npm ci`, configure the Supabase environment variables, and run `npm run dev`. Run `npm run check:qa` for the targeted security, reliability and performance checks.

## Deployment and operations

Read [the operations runbook](docs/OPERATIONS.md) before initializing a database or deploying migrations. It documents migration order, environment variables, durable delivery scheduling, backups and credential rotation.

See [the QA report](docs/QA-SECURITY-2026-09-22.md) for verified coverage and remaining operational dependencies.
