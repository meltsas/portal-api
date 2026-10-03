# portal-api

Backend/API for the Seasonal Rental Portal project, built on Cloudflare Workers.

## Purpose

This repository contains the backend logic for a Cloudflare-based portal.

Main responsibilities:

- public API endpoints
- protected admin endpoints
- D1 database access
- database migrations
- optional scheduled routines
- minimal backend business logic for seasonal rental and blog-related workflows

This repository is intentionally focused on backend/API concerns only.

## Stack

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2 (only when needed)
- TypeScript
- Wrangler

## Planned Authentication

This project is expected to use Google-based authentication for selected protected flows.

Planned examples:
- admin access
- protected admin API endpoints
- selected inquiry / lead-related flows if needed

Authentication is not implemented yet, but the backend should be designed so that protected routes can be added cleanly later without major refactoring.

## Principles

- keep the implementation small and readable
- prefer native Workers APIs and plain TypeScript
- avoid unnecessary third-party dependencies
- prioritize API security and defensive input handling
- minimize Cloudflare resource usage and avoid unnecessary cost
- make changes incrementally

## Project Scope

Planned or current areas of responsibility:

- offers / listings API
- lead / inquiry submission API
- admin-side endpoints
- blog workflow support
- scheduled routines for necessary automated tasks only

Out of scope by default:

- large framework-heavy architecture
- unnecessary background processing
- extra Cloudflare products unless clearly needed
- speculative abstractions for future use cases

## Scheduled Jobs

Two kinds of scheduled work are wired up from this repo:

- **Worker crons** (`wrangler.jsonc`): the hourly external-data fetch and the GitHub export that
  commits the weather, marine and booked-dates files to the Nuxt repo. Operations notes:
  `docs/cloudflare-operations.md`.
- **Local news** (`.github/workflows/local-news.yml`): a GitHub Actions workflow, not Worker code.
  Daily at 10:19 Europe/Madrid it checks out the Nuxt repo, runs the news pipeline that lives there
  (`scripts/costaseasons-news-v2`) and commits its one output file straight to the same branch the
  Worker exports to. Switched on and off with repository variables, no deploy needed. The pipeline
  does not fit the Workers Free plan (CPU time and subrequest limits), which is why it runs here;
  the analysis and the step plan are in `docs/local-news-github-actions-implementation.md`.

The Worker and the workflow commit to the same branch of the Nuxt repo. They touch different
files; the export job's non-forced ref update simply retries on the next window if it loses a race.

## Local Development

Install dependencies:

```bash
npm install
```

Typical local Worker URL:
http://localhost:8787

Main configuration lives in: wrangler.jsonc

Check the GitHub Actions workflow files before pushing (YAML syntax, basic workflow shape, cron
fields, pinned actions, `steps.<id>` references, and `bash -n` on every `run:` script when bash is
on the PATH):

```bash
npm run lint:workflows
```

GitHub itself only validates a workflow after it is pushed, so this is the local safety net. It
does not know the full workflow schema or an action's inputs; the first manual run on GitHub
remains the real test for those.
