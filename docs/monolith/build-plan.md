# Monolith build plan

Thirteen phases, from an empty folder to all 59 operations LIVE and a production-grade backend.
Each phase lists:
- the operations it makes LIVE;
- the steps;
- the concepts it practises;
- how to know it's done.

Work in the order given. Each phase builds on the platform pieces of the one before.

Rules for every phase:

- Each operation meets the [definition of done](../backend-standards.md#1-definition-of-done-for-an-operation)
  before its `x-status` flips.
- Switch the frontend to **Modular monolith** at the end of each phase and use what you built.
  The app is the acceptance test.
- Write down what surprised you, in an ADR if it changed a decision, or in the phase's
  "Notes" in this file.

| Phase | Theme | New LIVE | Total |
|---|---|---|---|
| 0 | Walking skeleton | 1 | 1 |
| 1 | Identity and auth | 7 | 8 |
| 2 | Social graph | 7 | 15 |
| 3 | Posts, likes, shares, bookmarks | 12 | 27 |
| 4 | Media pipeline | 4 | 31 |
| 5 | Events and the home feed | 1 | 32 |
| 6 | Comments | 6 | 38 |
| 7 | Notifications | 6 | 44 |
| 8 | Realtime and chat | 7 | 51 |
| 9 | Stories | 4 | 55 |
| 10 | Search and hashtags | 3 | 58 |
| 11 | Moderation | 1 | 59 |
| 12 | Production hardening | — | 59 |

---

## Phase 0 — Walking skeleton

**LIVE:** `getHealth` · **Status:** done 2026-10-26

A thin slice through every layer, so later phases only add features.

**Steps:**
1. Scaffold `backends/monolith` as in [structure.md](structure.md). Turn on strict TypeScript,
   add ESLint and Prettier, and add `tsx watch` for dev. Add the package to
   `pnpm-workspace.yaml`.
2. Write `compose.monolith.yaml` with Postgres 17, Redis 7 and MinIO (with a bucket created on
   start), plus Jaeger. Use the pinned `bitnamilegacy/minio` image; the official MinIO images
   can no longer be pulled ([ADR-0008](../adr/0008-minio-image.md)). Leave Prometheus and Grafana for phase 12.
3. Write `platform/config.ts`: a Zod schema of the environment variables, so the app fails fast.
4. Write `platform/logger.ts` (pino with redaction) and `request-context.ts` (AsyncLocalStorage
   carrying the trace id).
5. Write `platform/telemetry.ts`: OpenTelemetry auto-instrumentation exporting to Jaeger.
6. Write `platform/http/problem.ts`: one error handler, and a `ProblemError` type every layer
   throws.
7. Write `platform/http/validate.ts`: express-openapi-validator against `../../api/openapi.yaml`.
   Map its errors to `422` problem+json with `errors[]`.
8. Set up CORS for `http://localhost:5173`.
9. Write `platform/db`: a pg pool and Drizzle. Set up drizzle-kit and run a first empty
   migration (`drizzle-kit generate --custom`, into `drizzle/`).
10. Write `platform/health.ts`: `GET /v1/health` returning `{ status, architecture: "monolith",
    version, time, dependencies }`, plus `/livez` and `/readyz`.
11. Write `platform/shutdown.ts`: graceful `SIGTERM` handling.
12. Write the gateway at the repo root, `nginx/default.conf.template`: listen on `:8081` and
    proxy `/v1/` to the API, with a body size cap, timeouts, a `429` problem+json and the
    WebSocket upgrade headers (ready for phase 8). The upstream is a variable, so the same
    config reaches `pnpm dev` on the host or the `app` container
    ([ADR-0009](../adr/0009-shared-gateway-two-modes.md)).
13. Add the `package.json` scripts `compose`, `compose:full`, `down`, `dev`, `migrate`, `seed`,
    `test`, `lint`. The
    monolith is TypeScript only, so it needs no Makefile. Name the compose script `compose`,
    not `up`: bare `pnpm up` is pnpm's own alias for `pnpm update`.
14. Set up the test harness: Vitest, Supertest and Testcontainers Postgres (a Vitest
    `globalSetup` that starts the container and runs the migrations). Write HTTP tests for
    health, and for one route behind the validator (`404` and `422` problem+json), so a broken
    spec path fails CI.
15. Add a CI job for `backends/monolith` with path filters: lint, typecheck, tests, image
    build.

**Practises:** 12-factor config, structured logging, tracing from day one, contract-driven
validation, the Postgres migration workflow.

**Done when:**
- `pnpm compose && pnpm --filter monolith dev`, then the app (`pnpm dev`) shows the monolith
  as **Responding** in the sidebar. `pnpm compose:full` runs the API in a container instead,
  with the same result.
- `pnpm test:contract monolith getHealth` passes.
- A request shows up in Jaeger.

## Phase 1 — Identity and auth

**LIVE:** `register`, `login`, `refreshTokens`, `logout`, `getMe`, `updateMe`, `getUserProfile`

**Steps:**
1. Write the migration for `users`, `credentials` and `refresh_tokens`
   ([data model](data-model.md#identity)).
2. Domain: username and email rules, and password policy (length 8–128). Unit-test them.
3. Hash passwords with Argon2id (`@node-rs/argon2`). Make a failed login cost the same time
   whether the email exists or not.
4. JWT access tokens with `jose`: EdDSA keys from env, with `iss`, `aud`, `sub`, `exp` and a
   unique `jti`.
5. Refresh tokens: random 32 bytes, base64url, stored as SHA-256. Rotate on every refresh in one
   transaction (mark the old one used, insert the new one in the same family). If a used token
   comes back, revoke the family (ADR-0003). Logout revokes the presented token's family.
6. Auth middleware: verify the bearer token and put `req.user` on the request; `401`
   problem+json otherwise.
7. Rate limits: a Redis token bucket on login (per IP and per email), register (per IP) and
   refresh.
8. Profiles: `getUserProfile` returns stats and `relationship`. Until phase 2, `relationship`
   reports no follows; wire it to `graph` when that exists. `updateMe` validates media ids,
   which come in phase 4. Return `422` for them until then.
9. Seed: the demo account `test@test.com` / `testtest` and about 20 users.

**Practises:** password hashing, token design, rotation with reuse detection, constant-time
behaviour, brute-force protection.

**Done when:**
- In the app you can register, sign in, reload and stay signed in, and sign out.
- With a 1-minute access TTL, the app keeps working: the frontend's single-flight refresh
  handles it.
- A replayed refresh token revokes the session (there's a test for it).

## Phase 2 — Social graph

**LIVE:** `followUser`, `unfollowUser`, `listFollowers`, `listFollowing`, `blockUser`,
`unblockUser`, `listSuggestedUsers`

**Steps:**
1. Write the migration for `follows` and `blocks`, and give the graph module's `index.ts` its
   public queries: `isBlocked(a, b)`, `followsOf(userId, cursor)`, `relationship(viewer, target)`.
2. Follow and unfollow are idempotent `PUT` and `DELETE`. Counters on `users` update in the
   same transaction, through the identity module's public API (or by event, if you want to
   practise that early).
3. Blocking removes follows both ways. From now on every read path checks `isBlocked`, and a
   blocked profile returns `404`.
4. Keyset pagination on `(created_at, id)`. Write the cursor encoding once in
   `platform/http/pagination.ts`.
5. Suggestions: a friends-of-friends query plus popular and new fallbacks, cached in Redis.
6. Emit `UserFollowed` and `UserBlocked` for now (just log them). Phase 5 gives them
   consumers.

**Practises:** idempotent `PUT`/`DELETE`, keyset pagination, authorization that hides (`404`)
rather than forbids, denormalised counters.

**Done when:** you can follow and unfollow from profiles, the follower and following lists
paginate, and blocking hides profiles both ways (tested).

## Phase 3 — Posts, likes, shares, bookmarks

**LIVE:** `createPost`, `getPost`, `updatePost`, `deletePost`, `listUserPosts`, `likePost`,
`unlikePost`, `listPostLikes`, `sharePost`, `bookmarkPost`, `unbookmarkPost`, `listBookmarks`

Text-only posts at first. Phase 4 adds attachments.

**Steps:**
1. Write the migration for `posts`, `post_likes`, `bookmarks`, `post_hashtags` and
   `post_mentions`.
2. Domain: the visibility rule (public / followers / private, plus blocks) as one pure
   function, unit-tested exhaustively. Every read uses it.
3. Extract hashtags and mentions from text (contract limits: 5000 characters).
4. `Idempotency-Key` middleware with the `idempotency_keys` table (see the
   [standards](../backend-standards.md#3-http-conventions)). Apply it to `createPost` and
   `sharePost`.
5. `ETag` / `If-Match` on `updatePost` using the `version` column; return `412` on mismatch.
6. Soft delete. A share of a deleted post shows the share with its `sharedPost` hidden, as the
   contract allows.
7. Like, bookmark and their reverses as idempotent operations, with counters updated only when
   a row changes.
8. A batch hydration query: given post ids and a viewer, return posts with author summaries
   and `viewer.liked` / `viewer.bookmarked`, in a constant number of queries (no N+1). Feed,
   bookmarks, search and hashtags all reuse it.
9. Seed: posts across the seeded users, with hashtags and likes.

**Practises:** idempotency keys, optimistic concurrency, a central authorization rule,
avoiding N+1 queries.

**Done when:**
- You can compose, edit (and see a `412` when you edit a stale copy in two tabs), delete,
  like, share and bookmark in the app.
- Profile post lists and Saved work.
- A test proves a followers-only post is invisible to non-followers everywhere it can appear.

## Phase 4 — Media pipeline

**LIVE:** `createMediaUpload`, `completeMediaUpload`, `getMedia`, `deleteMedia`

**Steps:**
1. Write the migration for `media` and `media_variants`. Add `post_media` and connect
   `createPost.mediaIds` (≤ 10, owned by the caller, `ready`, not already attached).
2. **Design the module's storage and processing behind ports** (`MediaStorage`,
   `MediaProcessor`) with the `local` adapter now. The hybrid build swaps in a `remote`
   adapter selected by `MEDIA_ADAPTER`, and nothing outside `modules/media` may change
   ([hybrid seam](../architectures/hybrid.md#the-seam)).
3. `createMediaUpload`: validate type and size per purpose (15 MB images, 200 MB video;
   `413` above that), insert `pending`, and return a pre-signed MinIO PUT URL with
   content-type and length conditions. Make sure MinIO's CORS allows the frontend origin.
4. `completeMediaUpload`: check that the object exists, then set `processing` and enqueue
   `media-process` (BullMQ, `jobId = mediaId`) in the same transaction as an outbox row.
   Return `202`.
5. Worker (`worker.ts`): sniff magic bytes (`file-type`); sharp produces the thumb, small,
   medium and large WebP variants plus a blurhash. Video gets a poster frame via FFmpeg (HLS is
   a stretch goal). Set `ready` or `failed` with a reason, and emit `MediaReady`.
6. A repeatable cleanup job deletes media that is unattached and older than 24 h, along with
   its objects.
7. Wire avatars and covers into `updateMe`, plus media for stories and messages later.

**Practises:** pre-signed uploads (bytes never touch the API), background jobs with retries and
idempotent job ids, CPU work off the event loop, ports and adapters.

**Done when:**
- Posting photos from the app works end to end: upload progress, the "processing" state,
  then the photo in the post.
- Killing the worker mid-job and restarting it still finishes the job.
- A renamed `.exe` claiming to be `image/png` ends up `failed`.

## Phase 5 — Events and the home feed

**LIVE:** `getHomeFeed`

**Steps:**
1. `platform/events/outbox.ts`: use cases append events inside their transaction, and the
   relay claims unpublished rows (`FOR UPDATE SKIP LOCKED`) and dispatches them to
   subscribers through BullMQ.
2. `processed_events`: every consumer records the event id in the same transaction as its
   effect.
3. Convert the earlier events (`PostCreated`, `UserFollowed`, `UserBlocked`, `MediaReady`,
   `PostDeleted`) to the outbox.
4. Fan-out on write: on `PostCreated`, page through the author's followers in batches and
   `ZADD` the post id into each `timeline:{followerId}`, trimming to `TIMELINE_MAX`. Include
   the author's own timeline, for read-your-writes.
5. Fan-out on read: authors above `FEED_CELEBRITY_THRESHOLD` skip fan-out. At read time, merge
   their recent posts into the page.
6. `getHomeFeed`: read ids from the timeline by cursor (score + id), merge in celebrity posts,
   hydrate with the phase 3 batch query, and filter deleted, invisible and blocked posts.
7. A new follow backfills the last N posts of the followee. An unfollow or block filters at
   read time and cleans up lazily.
8. A cold timeline (a new user, or Redis flushed) is rebuilt from Postgres on read and then
   cached.

**Practises:** the transactional outbox, at-least-once delivery with idempotent consumers,
fan-out trade-offs, cache rebuilds.

**Done when:**
- Posting as user A shows up in follower B's Home within a second or two.
- Killing the relay mid-stream and restarting it loses nothing and duplicates nothing.
- Flushing Redis doesn't break Home.
- A k6 run finds the follower count where fan-out on write stops being cheaper. Record it in an
  ADR and set the threshold from it.

## Phase 6 — Comments

**LIVE:** `listComments`, `createComment`, `updateComment`, `deleteComment`, `likeComment`,
`unlikeComment`

**Steps:**
1. Write the migration for `comments` and `comment_likes`. Allow one reply level: a reply's
   parent must be top-level, otherwise `422`.
2. Visibility follows the post's. You can't comment on posts you can't see, and blocks apply
   both ways.
3. Counters: `posts.comments_count` and the parent's `reply_count`.
4. `ETag` / `If-Match` on edit. A soft-deleted comment with replies keeps its place but shows
   as deleted.
5. Emit `CommentCreated` and `CommentLiked` for phase 7.

**Done when:** threaded comments and their likes work in the post view, replies paginate under
their parent, and invisible posts' comments can't be read or written.

## Phase 7 — Notifications

**LIVE:** `listNotifications`, `getUnreadCounts`, `markNotificationRead`,
`markAllNotificationsRead`, `getNotificationPreferences`, `updateNotificationPreferences`

**Steps:**
1. Write the migration for `notifications` and `notification_preferences`.
2. Consumers: `UserFollowed` → `follow`; `PostLiked` → `post_like`; `CommentCreated` →
   `post_comment` or `comment_reply`; `CommentLiked`; `PostShared`; mentions; messages (phase 8).
3. Aggregation: upsert on `(recipient, type, target) where unread`. "Ada and 4 others liked
   your post" is one row, re-sorted by `updated_at`.
4. Never notify yourself, someone you blocked, or someone who blocked you. Respect each type's
   `inApp` preference.
5. Unread counts: count unread rows, cached in Redis and invalidated on change.
6. Email and push channels: write them to an outbox-fed log ("would send email to …") only.
   Real providers are out of scope locally.

**Practises:** event-driven read models, aggregation with upserts, preference-aware fan-out.

**Done when:** liking, following and commenting as user A shows aggregated notifications and
badge counts for user B (after a refresh; phase 8 makes it live).

## Phase 8 — Realtime and chat

**LIVE:** `createRealtimeTicket`, `listConversations`, `createConversation`, `getConversation`,
`listMessages`, `sendMessage`, `markConversationRead`

**Steps:**
1. `createRealtimeTicket`: a random ticket stored in Redis for 30 s, single use (`GETDEL`).
   Return `url = ws://localhost:8081/v1/realtime`.
2. `platform/realtime/ws-server.ts`: `ws` on the HTTP server at `/v1/realtime`. Authenticate the
   `?ticket=`, register the socket, send `ping` every 25 s and drop sockets that don't answer.
   Check that nginx proxies the upgrade.
3. Cross-process delivery: publish events to `ws:user:{id}`. Each process subscribes to the
   channels of the users it holds and writes to their sockets.
4. Resume: append each user's events to `ws:events:{userId}` (a stream trimmed to about 5
   minutes) and replay after `lastEventId` on `resume`.
5. Chat: write the migration for `conversations`, `conversation_members`, `messages` and
   `message_media`. Direct chats deduplicate on `direct_key`. `sendMessage` is idempotent on
   `clientMessageId`. It stores the message, increments other members' `unread_count`, and
   emits `message.created` (plus `unread.changed`).
6. Typing (client → server `typing`) fans out to the conversation's members with a 5 s expiry,
   and is never stored. Track presence from socket connects and disconnects.
7. `markConversationRead`: move the read marker, reset the count, and emit
   `conversation.read`.
8. Connect phase 7: `notification.created` and `unread.changed` are now pushed live.
9. Live `post.stats`: handle `subscribe` (≤ 50 post ids per socket) and throttle updates to
   one per second per post.

**Practises:** WebSocket auth with tickets, horizontal fan-out with Redis pub/sub, at-least-once
delivery with client-side reconciliation, presence.

**Done when:**
- Two browsers (two users) chat in real time with typing indicators and read markers.
- With **two API processes** behind nginx, messages still arrive whichever process each user
  hit.
- Killing one process makes clients reconnect, `resume`, and miss nothing.

## Phase 9 — Stories

**LIVE:** `listStoryReel`, `createStory`, `deleteStory`, `markStoryViewed`

**Steps:**
1. Write the migration for `stories` and `story_views`. A story needs a `ready` media item
   with purpose `story`.
2. Reel: group by author (you first, then followed users with unseen stories first), hide
   expired stories, and compute `seen` and `hasUnseen` for the viewer.
3. `markStoryViewed` is idempotent; `view_count` only counts first views.
4. A repeatable job purges expired stories and their media.

**Done when:** the stories bar fills up, viewed stories turn grey, and stories vanish after 24 h
(test this with a shortened TTL).

## Phase 10 — Search and hashtags

**LIVE:** `search`, `listTrendingHashtags`, `listHashtagPosts`

**Steps:**
1. Posts: a generated `tsvector` column with a GIN index; rank with `ts_rank`. Users: `pg_trgm`
   similarity on username and display name.
2. `search` merges users, posts and hashtags. It applies visibility and blocks to every result
   (a classic leak to test for).
3. Trending: a repeatable job computes `hashtag_stats.trend_score` over a sliding window with
   time decay.
4. `listHashtagPosts`: keyset over `post_hashtags`, then batch hydration.

**Practises:** full-text search in Postgres, trigram matching, precomputed rankings.

**Done when:** search and Explore work, and a followers-only post never appears in a
non-follower's search results (tested).

## Phase 11 — Moderation

**LIVE:** `createReport`

**Steps:**
1. Write the migration for `reports`. Reporting the same open target twice is idempotent.
2. Validate that the target exists and is visible to the reporter. Rate-limit reports per user.
3. Optional: a CLI or admin script to list open reports and action them (hide a post, suspend
   a user), so the effects are visible in the app.

**Done when:** all 59 operations are LIVE and `pnpm test:contract monolith` passes as a whole.

## Phase 12 — Production hardening

No new operations. This phase turns "it works" into "it's operable".

1. **Boundaries:** add dependency-cruiser rules for the
   [module rules](structure.md#module-rules-enforced-by-dependency-cruiser-in-ci) and fail CI on
   a violation. Fix whatever it finds.
2. **Metrics and dashboards:** Prometheus scraping with `prom-client`. Build a Grafana dashboard
   with RED per route, feed p99, outbox lag, queue depth and age, pool usage and socket count.
3. **Load tests (k6):**
   - feed reads at the [estimated](../system-design.md#back-of-the-envelope) peak ratio;
   - fan-out bursts;
   - chat delivery latency;
   - concurrent uploads.

   Record the results and bottlenecks in `load/RESULTS.md`.
4. **Indexes:** run `EXPLAIN ANALYZE` on every list query at about 1 M rows of seeded data, and
   fix any sequential scans.
5. **Gateway:** nginx `limit_req` per IP, stricter zones for auth routes, `client_max_body_size`,
   upstream keepalive, and timeouts. Return `429` problem+json from nginx.
6. **Security pass:** go through the [OWASP API Top 10](../backend-standards.md#6-security).
   Write the "user A vs user B" authorization test suite. Run a dependency audit in CI.
7. **Resilience drills:** restart Postgres, Redis and MinIO in turn during a k6 run. Document
   what users saw and what recovered on its own.
8. **Container hygiene:** a multi-stage image, a non-root user, a healthcheck, and separate
   `api` / `worker` / `relay` services in compose with resource limits.
9. **Read replica (stretch):** add a Postgres replica to compose and route profile and post
   reads to it. Observe replication lag against read-your-writes.
10. **README and runbook:** how to run, test and load-test; one runbook entry per alert.

**Done when:** you can show a dashboard during a load test, explain each bottleneck you found
and what you changed, and the [architecture note's practice checklist](../architectures/monolith.md#practice-checklist)
is fully ticked.

## Notes

Record surprises, measurements and decisions here as you go.
