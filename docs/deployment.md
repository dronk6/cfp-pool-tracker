# Deployment

- [Vercel setup](#vercel-setup)
- [Continuous Integration](#continuous-integration)

The app is deployed by Vercel's GitHub integration: every merge to `main` deploys automatically. There is **no deploy workflow** in this repo, and migrations and seed data are applied by hand ([Admin runbook](./admin-runbook.md)).

## Vercel setup

In the Vercel project settings under **Environment Variables**, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for Production and Preview. Do not add `SUPABASE_SECRET_KEY`. The values come from the Supabase dashboard; see [Environment variables](./development.md#environment-variables).

The build does not require any of these to be set; the app reads them when handling a request.

## Continuous Integration

A GitHub Actions workflow ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs on every pull request and on every push to `main`. It installs dependencies with `npm ci`, then runs `npm run lint`, `npm test`, `npm run typecheck` (`next typegen && tsc --noEmit`) and `npm run build`. It does not deploy (Vercel handles deployment).

The check appears on pull requests as **Checks**. To reproduce it locally, run `npm ci && npm run lint && npm test && npm run typecheck && npm run build`.

Making the check required before merging is a branch protection rule on `main`, configured by hand in the repository settings. The workflow does not set it up.
