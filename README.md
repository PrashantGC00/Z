# Z Arch

A personal practice project for **backend engineering and system design**.

## Purpose

Reading about architectures is easy; feeling their trade-offs is not. This project builds one
realistic product, a Facebook-style social app, **three times on the backend**, each time with
a different architecture, so the same features can be compared side by side:

- the same endpoints, the same data, the same frontend;
- different answers to the hard questions: where data lives, how services talk, how work is
  queued, what happens when something fails, how it scales.

The product is chosen because it touches most of what backend systems deal with: auth and
token rotation, a social graph, feed fan-out, file uploads and compression, realtime chat over
WebSockets, aggregated notifications, search, rate limiting and idempotency.

What is provided, and what is left as practice:

| Provided | Written by hand, as practice |
|---|---|
| The API contract (`api/openapi.yaml`) | All three backends |
| A Swagger server for the contract | The gateway (nginx) |
| A complete React frontend that talks to any backend | Databases, queues, Docker setup |
| An in-browser mock backend, so the frontend works today | Detailed designs and decisions |

The goal is also to practise several languages and databases: **Express + TypeScript, Go
(Fiber), Rust and Python (FastAPI)**, with **PostgreSQL and MongoDB**.

## The three architectures

| Architecture | What it practises | Port |
|---|---|---|
| **Modular monolith** (Express + TypeScript) | One deployable with strict module boundaries, real transactions, background jobs | 8081 |
| **Microservices** (Express TS, Go Fiber, Rust, FastAPI; PostgreSQL + MongoDB) | Data ownership per service, events between services, eventual consistency, polyglot services | 8082 |
| **Monolith + media service** | Extracting one capability (file uploads and compression) out of a monolith into its own service | 8083 |

All three sit behind an nginx gateway for rate limiting and request protection, and run
locally; no cloud account is needed. The monolith's walking skeleton (phase 0, `getHealth`)
is running; the other two are not started yet.

Suggested order: monolith first (learn the domain, find the seams), then microservices (cut
along those seams), then the media service (extract one module from the monolith).

Each one has a step-by-step build plan: [monolith](docs/monolith/), [microservices](docs/microservices/)
and [hybrid](docs/hybrid/), all held to the same [backend standards](docs/backend-standards.md).

## Quick start

```bash
pnpm install
pnpm dev            # app on http://localhost:5173, Swagger on http://localhost:8090
```

Sign in with **Use the demo account** (test@test.com / testtest). The app runs
against the in-browser mock until a backend exists.

- **Switch backends** from the sidebar or **Settings**. Each backend keeps its own session.

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app and Swagger together |
| `pnpm dev:web` | Start only the app (regenerates API types first) |
| `pnpm doc:api` | Start only Swagger on port 8090 |
| `pnpm build:web` | Typecheck and build the frontend |
| `pnpm lint` | ESLint the frontend and lint the OpenAPI contract with Redocly |
| `pnpm test` | Run the frontend unit tests (Vitest) |
| `pnpm test:contract <backend> [operationId...]` | Run Schemathesis contract tests against a running backend (needs [uv](https://docs.astral.sh/uv/)) |
| `pnpm typecheck` | Regenerate API types and typecheck everything |
| `pnpm format` | Prettier, including Tailwind class sorting |
| `pnpm compose` / `pnpm down` | Start or stop the monolith's dependencies and the nginx gateway; run the API yourself with `pnpm --filter monolith dev` |
| `pnpm compose:full` / `pnpm down:full` | The same, with the monolith API in a container too |

Backend URLs are set in `frontend/.env.local` (copy `frontend/.env.example`).

## The API contract

`api/openapi.yaml` is the single source of truth: 59 operations plus the WebSocket protocol
(in its **Realtime** section). Every backend implements it exactly, so the frontend can switch
between backends without code changes.

**Tracking progress with `x-status`.** Each operation says where it is implemented:

```yaml
x-status: { monolith: LIVE, microservices: OFFLINE, hybrid: OFFLINE }
```

- `LIVE`: that backend implements the operation and passes its contract tests.
- `OFFLINE`: not built yet. The frontend skips the call and says "not built on … yet",
  unless **Settings → Only call endpoints marked LIVE** is turned off.

Before flipping an operation to `LIVE`, check it with
`pnpm test:contract monolith createPost` (any architecture, any operationIds). With no
operationIds, it tests everything already `LIVE` on that backend, which catches regressions.
It signs in with the demo account so authenticated operations can be tested; override the
target with `CONTRACT_BASE_URL`, `CONTRACT_EMAIL` and `CONTRACT_PASSWORD`.

Swagger (`pnpm doc:api`, `api/swagger.ts`) shows one LIVE/OFFLINE badge per architecture next
to every operation and re-reads the spec on each refresh. Flip values to `LIVE` as you build,
starting with `getHealth`, then auth, then the feed.

**Conventions every backend follows:**

- Base path `/v1`; IDs are ULIDs; timestamps RFC 3339 UTC.
- Auth: `Authorization: Bearer <JWT>` (15 min), rotating refresh tokens via `POST /auth/refresh`.
- Lists: `?cursor=&limit=` → `{ data, page: { nextCursor, hasMore } }`.
- Errors: RFC 9457 `application/problem+json`, with `errors[]` for field validation.
- Creates accept `Idempotency-Key`; edits use `ETag` / `If-Match`.
- `GET /v1/health` reports `{ status, architecture }`, which the frontend polls.
- CORS must allow `http://localhost:5173`.

**Changing the contract:** edit `api/openapi.yaml`, run `pnpm lint` and `pnpm typecheck` (the
compiler shows every frontend call affected), then update the mock in
`frontend/src/mocks/handlers.ts`.

## The frontend

React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router, Zustand, MSW.

Every request goes through a typed client generated from the contract, with middleware that:

1. turns an unreachable backend into a clear "backend unreachable" error;
2. short-circuits operations marked `OFFLINE` for the selected backend;
3. adds the bearer token for that backend;
4. on `401`, rotates the refresh token once and replays the request.

Realtime: the app asks the backend for a WebSocket ticket, connects to the URL it returns and
writes incoming events (messages, typing, notifications, live counters) into the query cache.

The mock backend (`frontend/src/mocks/`) implements every operation with realistic latency,
validation errors, ETags, idempotency, media processing delays and simulated chat replies.
Its data lives in memory and resets on reload.

## Repository layout

```
api/
  openapi.yaml            the contract
  swagger.ts              Swagger dev server (swagger-ui-express, run by Node directly)
  contract-test.ts        runs Schemathesis against a backend for its LIVE operations
backends/
  monolith/               Express + TypeScript (phase 0 done)
  microservices/          ← to be written
  hybrid/                 ← to be written (monolith + media service)
docs/
  system-design.md        requirements, capacity estimates, data model, core flows
  backend-standards.md    the engineering bar every backend meets
  architectures/          design notes for the monolith, microservices and hybrid (what and why)
  monolith/               build plan: structure, data model, phases (how)
  hybrid/                 build plan: structure, core ↔ media protocol, phases
  microservices/          build plan: structure, service catalog, events and gRPC, phases
  adr/                    architecture decision records
frontend/
  src/api/                typed client, middleware, x-status helpers, generated types
  src/features/           one folder per product area (posts, chat, notifications, …)
  src/mocks/              in-browser mock backend
  src/realtime/           WebSocket client
nginx/                    the gateway: one config template, host or container upstream (ADR-0009)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, the checks to run before committing,
and the commit message conventions.

## AI disclosure

Parts of this repository were generated with AI (Claude, by Anthropic), with direction and
review from the author:

- the React frontend and its in-browser mock backend (`frontend/`);
- the API contract (`api/openapi.yaml`), the Swagger dev server (`api/swagger.ts`) and the
  contract test runner (`api/contract-test.ts`);
- the documentation in `docs/` and this README.

**The backends are hand-coded.** Everything under `backends/`, the nginx gateway, and the
databases, queues and infrastructure behind them are typed by the author. AI never writes or
edits these files. That is the point of the project: the backend and system design work is the
practice.

AI may still be used around the backend as a tutor, never as the author:

- **Allowed:** discussing designs and trade-offs, suggesting approaches, explaining concepts and
  showing errors, naming packages to add and functions or APIs to use, short code snippets
  (about 15 lines or less, one idea each) that show how something works, and reviewing
  hand-written code.
- **Not allowed:** AI creating or editing files under `backends/`, gateway configuration or
  infrastructure; whole files, handlers, modules or finished features; ready-to-apply diffs or
  patches; pasting AI output in unchanged. Snippets are retyped and adapted by hand.

## Features in the app

Accounts and profiles · follow / block · suggestions · home feed · posts with photos and
video · likes, shares, bookmarks · threaded comments · 24-hour stories · direct and group chat
with typing indicators and read markers · aggregated notifications with delivery preferences ·
search and trending hashtags · reporting.
