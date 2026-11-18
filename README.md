# PeopleFlow

React 19 and Next.js App Router application with Next.js API handlers and Neon PostgreSQL persistence.

## Run locally

Use Node matching package.json's engines requirement. Copy .env.example to .env.local and set DATABASE_URL. Run npm ci, then npm run dev, and open http://localhost:3000. Run npm run build and npm start to preview a production build.

Windows static generation uses one worker to avoid concurrent output-directory failures. Linux deployments keep Next's normal build parallelism.

## Configuration

DATABASE_URL stays server-side. Microsoft Entra sign-in requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID, and MICROSOFT_REDIRECT_URI. A dedicated tenant is required. ENABLE_DEMO_ADMIN controls the shared evaluation account; set it to false before production.

Password accounts use salted scrypt hashes and database-backed sessions. Owners and assigned members see shared projects; viewers are read-only.

## Delivery features

See [the project delivery guide](docs/delivery-guide.md) for bulk actions, configurable workflows, modules, versioned documents, project analytics, and keyboard shortcuts.

Schema initialization is versioned in lib/db.ts. Delivery migrations use an advisory lock and transaction. PostgreSQL normalizes workflow categories and completion flags so older task controls remain compatible.

## Verification

Run the regression scripts in scripts/ and npm run build.

scripts/planning-postgres-integration.cjs requires a disposable localhost PostgreSQL database. Install pg in ../qa-runtime (or set PEOPLEFLOW_TEST_PG_MODULE) and set PEOPLEFLOW_TEST_DATABASE_URL. It creates test records and exercises rollback, revision conflicts, access rules, workflow consistency, and persistence.

## Deployment

The connected Vercel projects deploy GitHub main automatically. Push completed changes as one reviewed batch after approval.
