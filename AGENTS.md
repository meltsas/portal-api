# AGENTS.md

# Seasonal Rental Portal / Portal API

This repository contains the backend/API for a Cloudflare-based project.

## Core Stack

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2 (only when needed)
- TypeScript
- Minimal dependencies by default

## Primary Goal

Build and maintain a small, readable, secure, and cost-aware backend for:

- public API endpoints
- protected admin endpoints
- lead/inquiry submission flows
- seasonal rental related business logic
- scheduled routines for strictly necessary automated tasks

The system should stay simple, maintainable, and cheap to run.

---

## Non-Negotiable Rules

### 1. Always verify Cloudflare specifics before changing infra-related code
Cloudflare Workers, D1, R2, Cron Triggers, limits, and APIs may change.

Before making any meaningful change involving:
- Workers runtime behavior
- Wrangler configuration
- D1 queries or migrations
- R2 bindings
- scheduled handlers
- limits, quotas, pricing, or platform behavior

always check the current official Cloudflare documentation first.

Do not rely on memory for Cloudflare-specific limits or APIs.

---

### 2. Prefer the simplest solution that works
Do not introduce complexity without a clear reason.

Prefer:
- plain TypeScript
- native Workers APIs
- small helper functions
- direct SQL with clear prepared statements

Avoid introducing:
- large frameworks
- ORM layers
- unnecessary abstractions
- extra services
- additional Cloudflare products unless clearly needed

---

### 3. Third-party dependencies are strongly discouraged
Assume new dependencies are unwanted by default.

Only add a third-party dependency if:
- it solves a real problem that would otherwise create significantly worse code
- the dependency is mature and well-maintained
- the dependency is small in scope
- there is no reasonable native/platform alternative

Before adding any dependency:
- explain why it is needed
- explain why native Workers / plain TypeScript is not enough
- ask for approval first

---

### 4. Security is a top priority
Treat all API input as untrusted.

Always:
- validate request method, path, and input shape
- reject unexpected or malformed input
- use prepared statements / bound parameters for SQL
- keep error responses minimal and safe
- avoid leaking internal implementation details
- design endpoints to be resilient against abusive or malicious requests

For public endpoints, always think about:
- rate limiting strategy
- payload size limits
- input validation
- spam / abuse prevention
- minimizing attack surface

For admin or privileged endpoints:
- require explicit authentication and authorization
- deny by default
- never assume a request is trusted just because it comes from the frontend

---

### 5. Cost control is mandatory
This project must use Cloudflare resources conservatively.

Always optimize for:
- fewer requests
- fewer writes
- fewer unnecessary reads
- fewer scheduled executions
- fewer moving parts

Do not:
- add polling when event-driven or manual triggering is enough
- add scheduled jobs unless they have a clear business need
- perform unnecessary D1 queries
- store unnecessary data
- introduce resource-heavy background logic without approval

If a design could increase cost noticeably, explain it first and ask for approval.

---

### 6. Keep code highly readable
Write code for long-term maintenance by a human developer.

Prefer:
- explicit names
- small functions
- clear control flow
- conservative abstractions
- comments only where they add real clarity

Avoid:
- clever code
- deeply nested logic
- premature generalization
- unnecessary indirection

The project should feel understandable to a developer familiar with Node/TypeScript, even if they are new to Cloudflare Workers.

---

### 7. Make changes incrementally
Prefer small, reviewable steps.

When working on a feature:
- change as little as necessary
- avoid broad refactors unless explicitly requested
- preserve working behavior
- keep commits / patches logically scoped

For significant architectural, security, or cost-related decisions:
- stop and ask for confirmation before proceeding

Do not silently make major design decisions.

---

## Repository Intent

This repository is for the backend/API only.

Expected responsibilities include:
- Worker routes / endpoint handlers
- D1 access
- migrations
- optional scheduled handlers
- shared validation / auth / security utilities
- minimal admin-related backend logic

This repository should not become a monolith for unrelated tooling.

---

## Cloudflare-Specific Guidance

### Workers
- Prefer native `fetch()` handler patterns unless there is a strong reason otherwise
- Keep request handling explicit and easy to follow
- Avoid Node-centric patterns that do not fit Workers well

### D1
- Use prepared statements and bound parameters
- Keep schema practical and minimal
- Favor simple, explicit SQL over abstraction-heavy patterns
- Be careful with write frequency and query count
- Migrations must be reviewed carefully before applying remotely

### R2
- Use only when file/object storage is truly needed
- Do not move content to R2 unless there is a clear reason
- Avoid unnecessary object duplication

### Scheduled Handlers / Cron
- Add scheduled routines only when there is a clear product need
- Keep scheduled logic idempotent where possible
- Keep schedule frequency as low as practical
- Explain why a cron job is needed before adding one

## Authentication Expectations

Authentication is not fully implemented yet, but the project is expected to support Google-based authentication for protected flows.

Examples include:
- admin access
- admin API routes
- selected lead / inquiry related actions if required

Do not assume admin endpoints should remain public.
Do not hardcode a long-term unauthenticated access model for privileged actions.
Ask for confirmation before introducing or changing the authentication model.

---

## Local Development Expectations

Prefer workflows that are easy to understand and reproduce.

When changing bindings:
- update `wrangler.jsonc`
- regenerate Worker types if needed

When changing database schema:
- use migrations
- prefer testing migrations locally first
- do not apply remote migrations casually

Do not assume production-only behavior without verifying it.

---

## Output Expectations for the Agent

When making meaningful changes, provide:

1. What changed
2. Why it changed
3. Security implications
4. Cost implications
5. Any Cloudflare-specific caveats
6. Anything that still needs explicit approval

If there are tradeoffs, say so clearly.

---

## Approval Gates

You must ask for confirmation before:

- adding a new dependency
- introducing a new Cloudflare product/service
- changing authentication model
- adding a scheduled job
- applying remote D1 migrations
- changing data model significantly
- adding anything that may increase cost or operational complexity
- making a broad refactor

---

## Things to Avoid

Avoid by default:
- ORMs
- heavy validation libraries unless justified
- broad framework adoption
- hidden magic
- automatic background behavior not explicitly requested
- over-engineering
- speculative abstractions for future use cases

---

## Preferred Development Style

Default to:
- minimal viable implementation
- explicit route handling
- clear TypeScript types
- defensive programming
- low operational overhead
- low Cloudflare usage
- secure-by-default decisions

When in doubt:
- choose the simpler option
- choose the cheaper option
- choose the safer option
- ask before making an important decision
