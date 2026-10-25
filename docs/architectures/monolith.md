# Modular monolith (Express + TypeScript)

> **Building it?** The step-by-step plan, folder layout and data design are in [docs/monolith/](../monolith/).

One deployable Node.js application, one PostgreSQL database, strict internal boundaries. It is
the fastest way to learn the domain and discover where the seams really are, so it is built
first.

## Shape

```mermaid
flowchart TB
  Client[React app] -->|HTTPS + WS| LB[nginx]
  LB --> N1[Node process]
  LB --> N2[Node process]
  subgraph App["Express 5 app (each process identical)"]
    direction LR
    identity --- graph --- content --- feed
    media --- messaging --- notifications --- search --- moderation
  end
  N1 -.-> App
  W[BullMQ workers<br/>same codebase, worker entrypoint]
  N1 & N2 & W --> PG[(PostgreSQL)]
  N1 & N2 & W --> R[(Redis: cache, timelines, pub/sub, queues)]
  N1 & N2 & W --> S3[(MinIO, S3-compatible)]
```

## Stack

| Concern | Choice | Why |
|---|---|---|
| HTTP | Express 5 | Async errors handled natively; the most common Node framework |
| Language | TypeScript (strict), Node 22+ | Same language as the frontend; shares the generated API types |
| Contract | `express-openapi-validator` against `api/openapi.yaml`, Zod for domain input | The contract is enforced at runtime, not just documented |
| Database | PostgreSQL 17 + Drizzle ORM + drizzle-kit migrations | SQL-first, typed queries, readable migrations |
| Cache, timelines, pub/sub | Redis 7 via `ioredis` | Sorted sets for timelines, pub/sub for sockets |
| Jobs | BullMQ | Outbox relay, fan-out, media processing, retries with backoff |
| Object storage | MinIO through `@aws-sdk/client-s3` | S3 API locally, no AWS account |
| Images | `sharp` | Fast thumbnails |
| WebSocket | `ws` attached to the HTTP server | Plain protocol matching the Realtime section of `api/openapi.yaml` |
| Auth | `jose` (JWT), `@node-rs/argon2` (passwords) | Standard, audited libraries |
| Logs and traces | `pino`, OpenTelemetry | Structured logs carrying trace ids |
| Boundaries | `dependency-cruiser` rules in CI | Fails the build when a module imports another's internals |
| Tests | Vitest + Supertest; Schemathesis against the contract | Unit, HTTP and contract layers |

## Modules

```
src/
  modules/
    identity/       index.ts (public API)  http/  application/  domain/  infra/
    graph/
    content/        posts, comments, likes, shares, bookmarks, stories
    feed/
    media/
    messaging/      conversations, messages, WebSocket gateway
    notifications/
    search/
    moderation/
  platform/         db, redis, event bus, outbox, auth middleware, problem+json errors
  main.ts           HTTP + WebSocket entrypoint
  worker.ts         BullMQ worker entrypoint
```

| Module | Owns tables | Publishes |
|---|---|---|
| identity | users, credentials, refresh_tokens | `UserRegistered` |
| graph | follows, blocks | `UserFollowed`, `UserBlocked` |
| content | posts, comments, likes, shares, bookmarks, stories | `PostCreated`, `PostLiked`, `CommentCreated` |
| feed | none (Redis only) | — |
| media | media, media_variants | `MediaReady` |
| messaging | conversations, members, messages, read_markers | `MessageCreated` |
| notifications | notifications, preferences | — |
| search | search_documents (`tsvector`) | — |
| moderation | reports | — |

**Rules:** other modules may import only `modules/<name>/index.ts`. A module never queries
another module's tables, and reacts to other modules only through the event bus. Inside each
module: `http` (routers) → `application` (use cases) → `domain` (pure logic) → `infra`
(Drizzle repositories, Redis, S3).

## How it handles the hard parts

| Flow | Implementation |
|---|---|
| Feed | `createPost` writes the post and an `outbox` row in one transaction. The relay enqueues a BullMQ fan-out job that `ZADD`s the post id into `timeline:{followerId}` (trimmed with `ZREMRANGEBYRANK`). Authors above the follower threshold are merged at read time |
| Media | `POST /media/uploads` returns a pre-signed MinIO URL. `complete` enqueues a job; the worker writes variants with sharp and marks the row ready |
| Chat | Message stored in Postgres, then `PUBLISH user:{id}` on Redis; every Node process subscribes and pushes to the sockets it holds |
| Notifications | Handler upserts with `INSERT … ON CONFLICT (recipient, type, target) WHERE NOT read DO UPDATE` to aggregate |
| Search | Postgres full-text (`tsvector` + GIN) and `pg_trgm` for usernames; trending from a materialized view refreshed by a repeatable job |
| Idempotency | `idempotency_keys` table holding the response for 24 h |

## Scaling path

1. More Node processes behind nginx; Redis pub/sub already spans processes for WebSockets.
2. Read replicas for profile, post and search reads.
3. Scale the worker entrypoint separately from the HTTP entrypoint.
4. Extract a module into a service only when its load or release cadence diverges. The module
   boundary becomes the service boundary.

## Trade-offs

| Good | Costs |
|---|---|
| One deploy, one debugger, one log stream | Scales as one unit |
| Real ACID transactions across modules | CPU-heavy work blocks the event loop unless moved to workers |
| Moving a boundary is just a code change | Boundaries erode without enforced rules |
| Cheapest to run | One bad deploy takes everything down |

## Practice checklist

- [ ] `getHealth` LIVE, returning `architecture: "monolith"`
- [ ] Request validation from `api/openapi.yaml`, errors as problem+json
- [ ] Auth with refresh rotation and reuse detection
- [ ] Outbox + BullMQ fan-out; load-test the feed with k6 to find the celebrity threshold
- [ ] Media pipeline with sharp workers
- [ ] WebSocket fan-out across two Node processes through Redis
- [ ] dependency-cruiser rule that fails on a boundary violation
- [ ] Schemathesis contract tests in CI
