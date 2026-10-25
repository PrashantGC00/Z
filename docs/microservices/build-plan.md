# Microservices build plan

Thirteen phases. Phase 0 builds the shared infrastructure; each later phase adds one or two
services, introducing a language or a pattern the first time it's needed. By phase 4 you have
built the [paved road](structure.md#the-paved-road-what-every-service-has) once in each of the
four languages. After that, each new service mostly applies it.

Rules for every phase:

- Each operation meets the [definition of done](../backend-standards.md#1-definition-of-done-for-an-operation)
  before its `x-status` flips for `microservices`. Contract tests run through the gateway at
  `:8082`.
- Each new service ticks the paved road table before it serves real traffic.
- At the end of each phase, switch the app to **Microservices** and use what you built.

| Phase | Theme | Services | New LIVE | Total |
|---|---|---|---|---|
| 0 | Platform and paved road | infra, nginx, proto, identity-svc skeleton | 1 | 1 |
| 1 | Identity | identity-svc (TS) | 6 | 7 |
| 2 | Graph, gRPC, first events | graph-svc (Go) | 7 | 14 |
| 3 | Posts and composition | post-svc (Python) | 14 | 28 |
| 4 | Media | media-svc (Rust) | 4 | 32 |
| 5 | Event-driven feed | feed-svc (Go) | 1 | 33 |
| 6 | Comments on MongoDB | comment-svc (Python) | 6 | 39 |
| 7 | Notifications | notification-svc (TS) | 6 | 45 |
| 8 | Realtime and chat | realtime-gateway (Go), chat-svc (Rust) | 7 | 52 |
| 9 | Stories | story-svc (Python) | 4 | 56 |
| 10 | Search | search-svc (Rust) | 2 | 58 |
| 11 | Moderation | moderation-svc (Python) | 1 | 59 |
| 12 | Resilience and operations | all | — | 59 |

---

## Phase 0 — Platform and paved road

**LIVE:** `getHealth` (served by the identity-svc skeleton)

**Steps:**
1. Lay out the repo as in [structure.md](structure.md).
2. Write `deploy/compose/docker-compose.yml`:
   - Redpanda and Redpanda Console;
   - one Postgres container with init scripts creating a database and a role per service;
   - MongoDB as a **single-node replica set**, needed for transactions and change streams;
   - Redis and MinIO (image per [ADR-0008](../adr/0008-minio-image.md));
   - an OTel Collector, Jaeger, Prometheus and Grafana.
3. `redpanda-init`: create every topic in [events.md](events.md#topics) with its partitions and
   retention.
4. `proto/`: set up buf lint, breaking-change detection and generation for the four languages.
   Write `common/v1/page.proto`.
5. `nginx.conf` on `:8082` with the [routing table](structure.md#gateway-routing), at first
   routing only `/v1/health`. Add a script that checks every contract path maps to an upstream.
6. Scaffold the identity-svc skeleton (Express TS): config, logging, OTel, problem+json,
   `/v1/health` reporting `architecture: "microservices"`, `/livez`, `/readyz`, graceful
   shutdown.
7. CI: a matrix job per service with path filters, plus a `proto` job running `buf lint` and
   `buf breaking`.

**Done when:** `make up`, the sidebar shows **Responding**, and the health request's trace goes
nginx → identity-svc in Jaeger.

## Phase 1 — Identity (Express TS, PostgreSQL)

**LIVE:** `register`, `login`, `refreshTokens`, `logout`, `getMe`, `updateMe`

**Steps:**
1. Port the monolith's identity module (the design, not a copy-paste of shortcuts) into its
   own service and database.
2. EdDSA signing keys. Serve the JWKS at an internal `/.well-known/jwks.json` (not routed by
   nginx) and include a `kid` header in tokens.
3. Outbox + relay in TypeScript. Publish `user.registered` and `user.updated`.
4. Rate-limit auth routes with Redis buckets.
5. `updateMe` media ids return `422` until phase 4.

**Practises:** a JWKS-based trust model, the first outbox relay.

**Done when:** sign-in works in the app against :8082, and events show up in Redpanda Console.

## Phase 2 — Graph, gRPC, first events (Go Fiber, PostgreSQL)

**LIVE:** `followUser`, `unfollowUser`, `listFollowers`, `listFollowing`, `blockUser`,
`unblockUser`, `listSuggestedUsers`

**Steps:**
1. Build the Go paved road: Fiber, `pgx` + `sqlc`, `slog`, OTel, JWKS verification, outbox
   relay with `franz-go`, graceful shutdown.
2. HTTP handlers for the seven operations, with keyset pagination.
3. gRPC server: `CheckRelationships`, `ListFollowerIds`, `IsBlocked`.
4. identity-svc consumes `z.graph.v1` for follower and following counters, idempotently
   (`processed_events`). This is its first consumer.
5. Follower lists need usernames and avatars: graph-svc calls `identity-svc.BatchGetUsers`
   (TypeScript gRPC server). This is the first cross-language gRPC call.

**Practises:** gRPC across languages, deadlines, an idempotent consumer, eventual consistency of
counters (follow, then immediately view the profile: what do you see? Write down why).

**Done when:**
- Following works in the app.
- A trace shows graph-svc → identity-svc over gRPC.
- Replaying `z.graph.v1` from offset 0 doesn't double-count followers.

## Phase 3 — Posts and composition (FastAPI, PostgreSQL)

**LIVE:** `createPost`, `getPost`, `updatePost`, `deletePost`, `listUserPosts`, `likePost`,
`unlikePost`, `listPostLikes`, `sharePost`, `bookmarkPost`, `unbookmarkPost`, `listBookmarks`,
`listHashtagPosts`, and `getUserProfile` (identity-svc, now that relationships and counts
exist)

**Steps:**
1. Build the Python paved road: FastAPI, SQLAlchemy 2 async + Alembic, Pydantic v2,
   structlog, OTel, aiokafka relay and consumers, a grpcio aio server and clients, ruff,
   mypy (strict), pytest + Testcontainers.
2. A user replica table fed by `z.user.v1`, so posts render authors without gRPC calls.
3. Visibility uses `graph-svc.CheckRelationships` (batched, cached 30 s per viewer, with a
   circuit breaker). Decide and document what happens when graph-svc is down: fail closed
   (hide followers-only posts) is the safe answer.
4. Idempotency keys, ETags and soft delete, as in the monolith.
5. Publish `z.post.v1` keyed by author id. identity-svc consumes it for `posts_count`.
6. gRPC: `BatchGetPosts`, `GetPostAccess`, `ListRecentPostIds`.
7. `getUserProfile` in identity-svc composes relationships from graph-svc.

**Practises:** local read replicas of another service's data, failure policy for dependencies,
composition by the owning service.

**Done when:**
- Composing, liking, sharing and bookmarking work in the app.
- With graph-svc stopped, posts still load and followers-only posts are hidden, not leaked.

## Phase 4 — Media (Rust Axum, PostgreSQL + MinIO)

**LIVE:** `createMediaUpload`, `completeMediaUpload`, `getMedia`, `deleteMedia`

**Steps:**
1. Build the Rust paved road: Axum + Tokio, `sqlx` (compile-time checked queries), `tracing`
   + OpenTelemetry, `tonic`, `rdkafka` relay, JWKS verification, graceful shutdown.
2. Pre-signed MinIO uploads, as in the monolith. Processing on `spawn_blocking` with the
   `image` crate, plus FFmpeg for video posters.
3. gRPC `ClaimMedia` (atomic: all ids or none) and `BatchGetMedia`. post-svc and identity-svc
   call them; turn on post attachments and avatars.
4. Publish `media.ready` and `media.failed`. A repeatable task garbage-collects unclaimed
   media.

**Done when:** photo posts and avatar changes work end to end, and claiming someone else's
media id fails.

## Phase 5 — Event-driven feed (Go Fiber, Redis)

**LIVE:** `getHomeFeed`

**Steps:**
1. A consumer group on `z.post.v1`: fan out by paging `graph-svc.ListFollowerIds` and
   pipelining `ZADD`s. Celebrities above the threshold are skipped and merged at read time.
2. Consume `z.graph.v1`: backfill on follow (`post-svc.ListRecentPostIds`), lazy cleanup on
   unfollow and block.
3. `getHomeFeed`: read ids by cursor, merge in celebrities, hydrate with `post-svc.BatchGetPosts`
   (which also re-checks visibility).
4. Watch consumer lag in Grafana; scale consumers up to the partition count.

**Practises:** partitioning and ordering, consumer lag, replays.

**Done when:**
- A post by A appears in follower B's Home within a couple of seconds.
- Stopping feed-svc for a minute, then starting it, catches up from lag with no loss.
- Deleting all timelines and replaying `z.post.v1` from the start rebuilds them.

## Phase 6 — Comments on MongoDB (FastAPI, MongoDB)

**LIVE:** `listComments`, `createComment`, `updateComment`, `deleteComment`, `likeComment`,
`unlikeComment`

**Steps:**
1. Document design and indexes as in the [catalog](services.md#comment-svc--fastapi--mongodb).
   One query loads a thread page.
2. **Multi-document transactions** for the comment, the parent's `replyCount` and the outbox
   insert. The relay reads the outbox through a change stream.
3. Access via `post-svc.GetPostAccess`. post-svc consumes `comment.created` and
   `comment.deleted` for `comments_count`.

**Practises:** MongoDB modelling for threads, transactions on a replica set, change streams.

**Done when:** threaded comments work in the app, and killing the relay between commit and
publish loses nothing.

## Phase 7 — Notifications (Express TS, MongoDB)

**LIVE:** `listNotifications`, `getUnreadCounts`, `markNotificationRead`,
`markAllNotificationsRead`, `getNotificationPreferences`, `updateNotificationPreferences`

**Steps:**
1. Consume the graph, post, comment and chat topics. Aggregate with an upsert on the partial
   unique index; skip self-notifications and blocked pairs (`graph-svc.IsBlocked`).
2. A TTL index removes notifications after 90 days.
3. Publish `notification.created` and `unread.changed` for realtime-gateway.

**Done when:** "X and 3 others liked your post" appears for user B after user A's actions,
with correct badges.

## Phase 8 — Realtime and chat (Go Fiber + Rust Axum)

**LIVE:** `createRealtimeTicket`, `listConversations`, `createConversation`, `getConversation`,
`listMessages`, `sendMessage`, `markConversationRead`

**Steps:**
1. realtime-gateway: tickets in Redis, `/v1/realtime` WebSocket (`gofiber/contrib/websocket`),
   ping/pong, a per-user replay stream for `resume`, `subscribe` for post stats, and a
   connection registry in Redis.
2. chat-svc: the conversation and message documents from the
   [catalog](services.md#chat-svc--rust-axum--mongodb), idempotent `sendMessage` on
   `clientMessageId`, read markers and unread counts. Publish `z.chat.v1` keyed by conversation.
3. Delivery: the gateway consumes chat, notification and post-stats events and delivers them to
   the members' sockets. Try both [delivery designs](services.md#realtime-gateway--go-fiber--redis).
   Measure p99 sender → recipient against the 1 s target.
4. Client `typing` frames: the gateway forwards them to chat-svc's members check, then fans
   out. They are never stored.

**Done when:**
- Two browsers chat in real time through :8082.
- With **two gateway instances**, killing one makes its clients reconnect to the other,
  `resume`, and miss nothing.

## Phase 9 — Stories (FastAPI, MongoDB)

**LIVE:** `listStoryReel`, `createStory`, `deleteStory`, `markStoryViewed`

**Steps:** stories with a **TTL index on `expiresAt`**; idempotent views; a reel grouped by
author (following list from graph-svc, cached); media claimed through media-svc.

**Done when:** stories expire on their own (test with a short TTL) without any job.

## Phase 10 — Search (Rust Axum, tantivy)

**LIVE:** `search`, `listTrendingHashtags`

**Steps:**
1. Consume the user and post topics into a tantivy index on a volume, and commit periodically.
2. Trending: windowed counts with decay, from `post.created` hashtags.
3. Filter results by visibility with `graph-svc.CheckRelationships`, and check post visibility
   via `post-svc.BatchGetPosts` hydration.

**Practises:** a projection as a disposable index.

**Done when:** deleting the index volume and replaying from offset 0 rebuilds identical
results.

## Phase 11 — Moderation (FastAPI, PostgreSQL)

**LIVE:** `createReport`

**Steps:** reports with idempotent open reports per target. Verify the target through the
owning service. Publish `report.created`.

**Done when:** all 59 operations are LIVE and `pnpm test:contract microservices` passes as a
whole.

## Phase 12 — Resilience and operations

1. **Failure drills** (record each in `load/RESULTS.md`):
   - kill each service in turn during a k6 run, and note what users saw;
   - add latency to graph-svc with Toxiproxy, and watch the circuit breakers open and the
     fallbacks work;
   - restart Redpanda and confirm producers and consumers recover.
2. **Replays:** reset a consumer group to an earlier offset and prove no duplicate effects
   anywhere.
3. **DLQs:** inject a malformed event, see it land in the DLQ, fix it and re-drive it.
4. **Account deletion saga (practice, not in the contract):** an internal admin endpoint on
   identity-svc emits `user.deleted`. Each service purges its data and emits `*.purged`, and
   identity-svc completes once all have reported. Handle a service that's down during the saga.
5. **Observability:**
   - one dashboard per service (RED);
   - a system dashboard with consumer lag per group, outbox age and gRPC error rates;
   - follow one feed request across nginx → feed-svc → post-svc → graph-svc in Jaeger.
6. **SLOs:** write SLOs for feed p99 (< 200 ms) and message delivery (< 1 s), with
   Prometheus alerts and a runbook entry each.
7. **Kubernetes (optional):** k3d, one Helm chart per service with liveness and readiness
   probes, resource requests and limits, and HPA on CPU for feed-svc and media-svc.

**Done when:** the [architecture note's practice checklist](../architectures/microservices.md#practice-checklist)
is fully ticked, and an ADR compares running this to the monolith: what it bought, what it
cost, with numbers.

## Notes

Record surprises, measurements and decisions here as you go.
