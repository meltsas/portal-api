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

## Local Development

Install dependencies:

```bash
npm install
```

Typical local Worker URL:
http://localhost:8787

Main configuration lives in: wrangler.jsonc
