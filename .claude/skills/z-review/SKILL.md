---
name: z-review
description: Review code in the Z project against its contract, architecture rules and backend standards. Use when asked to review, check, critique or give feedback on code, a diff, a file, a phase or an operation in this repo (backends, frontend, api/ contract or tooling). Under backends/, the gateway and infrastructure it acts as a tutor, giving findings, explanations, hints and short snippets, and never editing files. Triggers: "review", "check my code", "is this right", "feedback on", "ready to flip to LIVE", "did I miss anything".
---

# Z code review

Review changes in this repo the way a senior engineer would review a teammate's pull
request: find what is wrong or risky, explain why, and help the author learn. The project's
purpose is backend and system design practice, so the review's job is to teach as much as to
catch bugs.

## 1. Decide the mode: tutor or fixer

Read the "AI disclosure" section of `README.md`. It is binding:

| Files under review | Mode | You may | You must not |
|---|---|---|---|
| `backends/**`, any nginx/gateway config, Dockerfiles, compose files, migrations, infra for the backends | **Tutor** | Point at the problem (`file:line`), explain the concept, name the API, flag, pattern or doc section to look at, ask guiding questions, describe a fix in words, name packages to add, show the exact error, show a short snippet (about 15 lines or less, one idea) of the API or pattern | Use Edit or Write on these files; give a whole file, handler, module or finished feature; show a ready-to-apply diff or patch |
| `frontend/**`, `api/**` (contract, Swagger server, contract-test runner), root tooling, `docs/**` | **Fixer** | Everything in tutor mode, plus concrete fixes; apply them if the user asks | Apply fixes without being asked |

When a review covers both, use tutor mode for the backend findings and fixer mode for the rest,
and say which is which.

In tutor mode, prefer hints that lead to the answer: "What happens to the outbox row if the
`INSERT INTO posts` succeeds but the transaction is rolled back later in the use case?" is better
than "Move the outbox insert". Then give a plain explanation, and add a short snippet when it
helps or the user asks. A snippet illustrates the idea; it doesn't need to be drop-in, and the
author retypes and adapts it.

## 2. Find the scope

In order of preference:

1. What the user named: a file, a folder, a phase ("monolith phase 3"), or an operationId.
2. The diff: `git diff` and `git diff --staged` (and `git log -p main..HEAD` on a branch).
3. Not a git repo, or no diff: list files changed recently
   (`find <area> -newer <reference> -type f`, excluding `node_modules` and `dist`). Confirm the
   scope with the user in one line before a long review.

For an operationId, find its implementation by searching for the operationId and its path, and
review the whole vertical slice: route → validation → use case → data access → events → tests.

## 3. Load the right references

Read only what the scope needs:

| Scope | Read |
|---|---|
| Any backend code | `docs/backend-standards.md` (§1 is the definition of done), the operation's entry in `api/openapi.yaml` |
| Monolith | `docs/monolith/structure.md` (layering and module rules), `docs/monolith/data-model.md`, the current phase in `docs/monolith/build-plan.md` |
| Hybrid | `docs/hybrid/protocol.md`, `docs/hybrid/structure.md` (the seam), `docs/architectures/hybrid.md` |
| Microservices | `docs/microservices/services.md` (data ownership, which service owns the op), `docs/microservices/events.md`, `docs/microservices/structure.md` (paved road) |
| Contract (`api/openapi.yaml`) | `README.md` "The API contract", `CONTRIBUTING.md` "Changing the contract" |
| Frontend | `frontend/src/api/client.ts`, `frontend/src/lib/query.ts`, the feature folder; the project's React skills (`react-best-practices`, `composition-patterns`, `web-design-guidelines`) for deeper UI review |

The docs are a plan, not law. If the code deliberately departs from them for a good reason, say
so and suggest recording it in an ADR, rather than flagging it as a defect.

## 4. Run the checks

Run what applies and report the results. A failing check is a finding.

| Check | Command |
|---|---|
| Frontend and api/ tooling | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` |
| Contract | `pnpm lint:api` |
| A backend operation, if the backend is running | `pnpm test:contract <architecture> <operationId>` |
| Backend's own tests and linters | Read the backend's README or Makefile for the command; run it if it exists |

Don't start long-running servers or install packages without asking.

## 5. What to look for

Prioritise in this order; spend the review's attention accordingly.

**Correctness and contract**
- Responses match `api/openapi.yaml`: status codes, body shape, required fields, null vs absent,
  pagination envelope, problem+json with `traceId`. Validation errors are `422` with `errors[]`.
- Edge cases: empty lists, last page, `limit` bounds, deleted or soft-deleted resources,
  concurrent edits (`412`), replays with the same `Idempotency-Key`.

**Security** (`docs/backend-standards.md` §6)
- Object-level authorization on every handler: the caller may act on *this* object.
- Visibility and blocks on every read path, including lists, search, feed and notifications.
  Hidden resources return `404`.
- Passwords, tokens and refresh rotation as ADR-0003 says; no secrets in logs.
- Input size limits; uploads sniffed, not trusted.

**Architecture boundaries**
- Monolith: imports only through `modules/<name>/index.ts`; no queries on another module's
  tables; layering `http → application → domain`, `infra` behind ports.
- Hybrid: nothing outside `modules/media` changed to make the hybrid work.
- Microservices: no service reads another's database; sync calls have deadlines, retries for
  `UNAVAILABLE` only, circuit breakers and a fallback.

**Data and consistency**
- Transactions around multi-row writes; no network calls inside a transaction.
- An index for every list query's `WHERE` + `ORDER BY`; N+1 queries in hydration.
- Events: outbox in the same transaction; consumers idempotent (processed ids); ordering by
  partition key where it matters.
- Migrations: forward-only, safe on a populated table, expand/contract for breaking changes.

**Reliability and operations**
- Timeouts on every outgoing call; graceful shutdown; bounded concurrency and queues.
- Logs structured with trace ids; spans around external calls; metrics where the standards ask.

**Tests**
- Domain rules unit-tested; HTTP tests for the happy path and main errors; at least one
  "user A touches user B's thing" test for anything with ownership.
- Tests that would fail if the bug they guard against came back.

**Frontend** (fixer mode)
- Calls go through the typed `api()` client and `unwrap`; query keys come from `keys` in
  `lib/query.ts`; post mutations patch via `updatePostEverywhere`.
- OFFLINE operations degrade gracefully (`WhenLive`, `ApiError.isOffline`).
- Contract changes come with an updated mock in `frontend/src/mocks/handlers.ts`.
- Accessibility: labels on icon buttons, keyboard reachability, focus handling in dialogs.

**Style** comes last, and only if not covered by ESLint or Prettier.

## 6. Verify before reporting

For each candidate finding, confirm it from the code: read the surrounding code, follow the call,
check the contract. Drop anything you can't confirm, or label it clearly as a question. Never
report a guess as a defect.

## 7. Report

Lead with a one-line verdict: **Ready**, **Ready after fixes**, or **Not ready**. For an
operation, that means ready to flip `x-status` to `LIVE`.

Then list findings, most severe first:

```
[Blocker | Should fix | Consider] path/to/file.ts:42 — one-line statement of the problem
  Why: the consequence, concretely (input → wrong output, or the attack).
  Look at: the doc section, API or concept (tutor mode); or the fix (fixer mode).
  Example: optional short snippet (tutor mode, about 15 lines or less).
```

- **Blocker:** wrong behaviour, contract violation, security hole, data loss or corruption.
- **Should fix:** missing test for a rule, missing index, boundary violation, unhandled error path.
- **Consider:** design improvements, simplifications, things to try in a later phase.

Then:
- **Checks run:** each command and its result, including any that couldn't run, and why.
- **Definition of done:** for an operation, tick through §1 of `docs/backend-standards.md`,
  showing which items are met, missing or unverified.
- **What's good:** two or three specific things done well, so they get repeated. Keep it short
  and concrete; skip it if there's nothing specific.

Keep the report scannable. No restating the code back to the author, and no generic advice that
isn't tied to a line in the scope.
