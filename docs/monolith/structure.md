# Monolith project structure

The layout of `backends/monolith`. The [architecture note](../architectures/monolith.md#modules)
names the modules and the tables they own; this document shows where everything lives.

## Top level

```
backends/monolith/
  src/
    main.ts                 HTTP + WebSocket entrypoint: config → platform → modules → listen
    worker.ts               BullMQ entrypoint: the same modules, registering job processors
    relay.ts                Outbox relay entrypoint (can start inside worker.ts at first)
    app.ts                  Builds the Express app (no listen), so tests can mount it
    modules/                One folder per bounded context (below)
    platform/               Technical building blocks shared by every module (below)
  db/
    migrations/             drizzle-kit SQL migrations, one folder per migration, committed
    seed/                   Idempotent seed: demo account, users, follows, posts, media
  test/
    helpers/                Test app factory, Testcontainers setup, auth helpers, builders
    http/                   One file per contract tag: auth.test.ts, posts.test.ts, …
  load/                     k6 scripts: feed.js, fanout.js, chat.js, uploads.js
  nginx/
    nginx.conf              Gateway on :8081 (hand-written)
  observability/
    prometheus.yml
    grafana/                Provisioned datasources and dashboards (JSON)
  compose.monolith.yaml     Postgres, Redis, MinIO, Jaeger, Prometheus, Grafana
  Dockerfile                Multi-stage, non-root; one image, three entrypoints
  .dependency-cruiser.cjs   Boundary rules (below)
  drizzle.config.ts
  .env.example
  package.json              Scripts: compose, dev, worker, migrate, seed, test, lint, load
  tsconfig.json
  README.md
```

`main.ts`, `worker.ts` and `relay.ts` share one codebase and one image, and differ only by
entrypoint. You can scale API processes and workers independently without separate builds.

## A module

Every module has the same shape. Here is `content`:

```
src/modules/content/
  index.ts                  The module's public API: the ONLY file other modules may import
  http/
    posts.router.ts         Express routers: parse, call a use case, map the result to HTTP
    comments.router.ts
    presenters.ts           Domain → contract response shape (Post, Comment, PostPage)
  application/
    create-post.ts          One use case per file: orchestrates domain + repositories
    like-post.ts
    …
    ports.ts                Interfaces the use cases need (repositories, clock, event bus)
  domain/
    post.ts                 Entities and value objects; pure functions, no I/O
    visibility.ts           Rules: who may see a post
    errors.ts               Domain errors (PostNotFound, NotPostOwner, …)
  infra/
    post.repository.ts      Drizzle implementations of the ports
    schema.ts               This module's Drizzle table definitions
  events.ts                 Events this module publishes, with payload types
  subscriptions.ts          Handlers for other modules' events
  jobs.ts                   Job processors this module registers in worker.ts
  content.test.ts           Unit tests for domain rules (more live next to the files)
```

### Layering rules

```
http  →  application  →  domain
              ↓
            infra (implements application/ports.ts)
```

| Layer | May import | Must not |
|---|---|---|
| `domain` | Nothing outside `domain` | Express, Drizzle, Redis, `process.env`, the clock (pass time in) |
| `application` | `domain`, its own `ports.ts`, `platform` interfaces | Express types, Drizzle queries |
| `http` | `application`, `presenters` | Repositories directly |
| `infra` | `domain`, `platform/db`, `platform/redis`, `platform/storage` | Other modules' `infra` |

### Module rules (enforced by dependency-cruiser in CI)

1. Another module may import only `modules/<name>/index.ts`.
2. A module queries only its own tables; `infra/schema.ts` is private.
3. Cross-module reactions go through the event bus (`events.ts` / `subscriptions.ts`), never
   by calling another module's internals.
4. Synchronous reads across modules go through the other module's `index.ts` (for example,
   `content` asks `graph` "is A blocked by B?").
5. `platform` never imports a module.

If a rule is hard to keep, that is a design signal: the boundary may be in the wrong place.
Write an ADR when you move it.

## platform/

```
src/platform/
  config.ts                 Env schema (Zod), parsed once, typed export
  logger.ts                 pino with trace id mixin and Authorization redaction
  telemetry.ts              OpenTelemetry SDK: HTTP, Express, pg, ioredis instrumentation
  http/
    problem.ts              ProblemError type and the single error-to-problem+json handler
    validate.ts             express-openapi-validator wired to api/openapi.yaml
    auth.ts                 Bearer JWT verification → req.user
    idempotency.ts          Idempotency-Key middleware (stores responses for 24 h)
    etag.ts                 ETag / If-Match helpers
    pagination.ts           Cursor encode/decode, limit clamp, page envelope
    rate-limit.ts           Redis token bucket for login, register, refresh
    request-context.ts      AsyncLocalStorage: trace id, user id
  db/
    client.ts               pg pool + Drizzle instance
    transaction.ts          Unit-of-work helper that also collects outbox events
  redis.ts                  ioredis clients (commands, pub, sub)
  storage.ts                S3 client for MinIO, pre-signing helpers
  queue.ts                  BullMQ queue/worker factories with shared retry policy
  events/
    bus.ts                  In-process event bus interface
    outbox.ts               Outbox table, writer and relay loop
  realtime/
    ws-server.ts            ws server attached to the HTTP server, ticket auth
    connections.ts          Local connection registry (userId → sockets)
    fanout.ts               Redis pub/sub: publish to user, deliver to local sockets
    replay.ts               Per-user event buffer for resume (Redis stream, 5 min)
  ids.ts                    ULID generation
  health.ts                 /v1/health, /livez, /readyz
  shutdown.ts               SIGTERM handling, ordered close of server, workers, pools
```

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case, suffix by role | `create-post.ts`, `post.repository.ts`, `posts.router.ts` |
| Use cases | verb-noun, matching the operationId where one exists | `createPost`, `likePost` |
| Tables | snake_case, plural | `posts`, `post_likes`, `refresh_tokens` |
| Columns | snake_case; `*_id` for foreign keys; `created_at` | `author_id` |
| Events | PascalCase past tense | `PostCreated`, `UserFollowed` |
| Queues | kebab-case by purpose | `feed-fanout`, `media-process`, `outbox-relay` |
| Redis keys | `colon:separated:{id}` | `timeline:{userId}`, `ratelimit:login:{ip}` |
| Env vars | SCREAMING_SNAKE, grouped by prefix | `DATABASE_URL`, `JWT_PRIVATE_KEY`, `S3_ENDPOINT` |

## Configuration (`.env.example`)

| Variable | Example | Used by |
|---|---|---|
| `NODE_ENV` | `development` | all |
| `PORT` | `3000` | main |
| `PUBLIC_BASE_URL` | `http://localhost:8081/v1` | ticket URLs, media URLs |
| `CORS_ORIGINS` | `http://localhost:5173` | main |
| `DATABASE_URL` | `postgres://z:z@localhost:5432/z` | all |
| `REDIS_URL` | `redis://localhost:6379` | all |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | `http://localhost:9000`, … | main, worker |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE` | PEM, `z-monolith`, `z` | main |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | `15m`, `30d` | main |
| `FEED_CELEBRITY_THRESHOLD`, `TIMELINE_MAX` | `10000`, `800` | worker, main |
| `MEDIA_ADAPTER` | `local` (`remote` in the hybrid core) | main, worker |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | `http://localhost:4318`, `z-monolith` | all |
| `LOG_LEVEL` | `info` | all |

## Request lifecycle

```
nginx :8081 (rate limit, body cap, request id)
  → request-context (trace id, AsyncLocalStorage)
  → pino-http access log
  → CORS
  → openapi validator (shape of params, query and body)
  → auth (JWT → req.user) where the operation needs it
  → idempotency / If-Match where the operation uses them
  → module router → use case → repositories (one transaction + outbox rows)
  → presenter → JSON response
  → problem handler for anything thrown
```
