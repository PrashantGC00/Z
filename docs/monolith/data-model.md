# Monolith data model

The PostgreSQL tables and Redis keys, grouped by the module that owns them. A module reads and
writes only its own tables ([structure rules](structure.md#module-rules-enforced-by-dependency-cruiser-in-ci)).
Field names follow the contract's schemas in `api/openapi.yaml`, so presenters stay thin.

This is a design to start from, not a finished schema. Expect to change it as you build, and
record significant changes in an ADR.

**Conventions:**
- Every id is a ULID stored as `text` with a length `CHECK`, or `uuid` if you encode ULIDs as
  UUIDs. Pick one in phase 0 and write it down.
- Timestamps are `timestamptz`.
- Counters such as likes and followers are denormalised columns, updated in the same
  transaction as the row they count (see [the unread-counts access pattern](../system-design.md#data-model)).
- "Index" below lists the indexes the access patterns need beyond primary keys.

## identity

**users**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK |
| email | citext | unique; `citext` makes it case-insensitive |
| username | text | unique; `CHECK` matches the contract's `^[a-z0-9_.]{3,30}$` |
| display_name | text | ≤ 60 |
| bio, location, website | text null | ≤ 300 / 60 / URL |
| avatar_media_id, cover_media_id | ULID null | Points at `media`. Resolve URLs through the media module, not a join |
| verified | boolean | default false |
| posts_count, followers_count, following_count | integer | default 0 — maintained by content and graph handlers |
| created_at, updated_at | timestamptz | |

Index: `username` (unique), `email` (unique), and a trigram index on `username` and
`display_name` for search (owned here, queried through the identity module).

**credentials** — `user_id` (PK, FK users), `password_hash` (Argon2id encoded string),
`updated_at`. Kept separate from `users` so profile reads never load hashes.

**refresh_tokens**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK |
| user_id | ULID | FK users |
| family_id | ULID | All rotations of one sign-in share it |
| token_hash | bytea | SHA-256 of the opaque token; unique |
| expires_at | timestamptz | |
| used_at | timestamptz null | Set on rotation. Presenting a used token revokes the whole family |
| revoked_at | timestamptz null | |
| created_at, user_agent, ip | | For a future "devices" screen |

Index: `token_hash` (unique), `(family_id)`, `(user_id)`.

## graph

**follows** — `follower_id`, `followee_id` (PK on the pair), `created_at`.
Index: `(followee_id, follower_id)` for followers lists, `(follower_id, created_at desc)` for
following lists and fan-out paging.

**blocks** — `blocker_id`, `blocked_id` (PK on the pair), `created_at`. Blocking removes any
follows in both directions in the same transaction.

Suggestions (`listSuggestedUsers`): start with a query for friends-of-friends you don't follow,
ranked by mutual count, falling back to popular and then new users (`reason` in the contract).
Cache per user in Redis for 10 minutes.

## content

**posts**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK; sorts by time |
| author_id | ULID | |
| text | text | ≤ 5000 |
| visibility | enum `public`, `followers`, `private` | |
| shared_post_id | ULID null | FK posts. A share is a post pointing at another |
| hashtags | text[] | Extracted on write; also drives `post_hashtags` |
| likes_count, comments_count, shares_count | integer | |
| version | integer | The `ETag`; incremented on edit |
| edited_at, deleted_at | timestamptz null | Soft delete, because shares point at posts |
| created_at | timestamptz | |

Index: `(author_id, id desc) where deleted_at is null` for profile lists.

**post_media** — `post_id`, `media_id`, `position` (0–9). PK `(post_id, position)`; unique
`media_id` (one post per media).

**post_mentions** — `post_id`, `user_id`. Feeds `mention` notifications.

**post_hashtags** — `tag`, `post_id`, `created_at`. PK `(tag, post_id)`. Index
`(tag, post_id desc)` for `listHashtagPosts`.

**post_likes** — `post_id`, `user_id`, `created_at`. PK `(post_id, user_id)`; index
`(user_id, created_at desc)`. Like and unlike are idempotent `PUT` and `DELETE`: insert with
`ON CONFLICT DO NOTHING`, then adjust the counter only if a row changed.

**bookmarks** — `user_id`, `post_id`, `created_at`. PK `(user_id, post_id)`; index
`(user_id, created_at desc)`.

**comments**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK |
| post_id | ULID | |
| parent_id | ULID null | One reply level: a parent must itself have `parent_id is null` |
| author_id | ULID | |
| text | text | ≤ 2000 |
| likes_count, reply_count | integer | |
| version, edited_at, deleted_at, created_at | | As for posts |

Index: `(post_id, parent_id, id)` covers both top-level comments and replies to one comment.

**comment_likes** — like `post_likes`.

**stories** — `id`, `author_id`, `media_id`, `caption`, `created_at`, `expires_at`
(`created_at + 24 h`), `view_count`. Index `(author_id, expires_at)`. Expired rows are filtered
on read and purged by a repeatable job.

**story_views** — `story_id`, `viewer_id`, `viewed_at`. PK `(story_id, viewer_id)`.

## media

**media**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK |
| owner_id | ULID | |
| purpose | enum `post`, `story`, `avatar`, `cover`, `message` | |
| kind | enum `image`, `video` | From the content type |
| content_type | text | Declared; the sniffed type must match |
| size_bytes | bigint | Declared; enforced by the pre-signed URL's conditions |
| status | enum `pending`, `processing`, `ready`, `failed` | |
| width, height, duration_ms | integer null | Set by the worker |
| blurhash, alt_text | text null | |
| failure_reason | text null | |
| attached_at | timestamptz null | Set when a post, story or message uses it. Unattached and older than 24 h means garbage-collect |
| created_at | timestamptz | |

Index: `(status, created_at) where attached_at is null` for the cleanup job.

**media_variants** — `media_id`, `name` (`original`, `thumb`, `small`, `medium`, `large`,
`hls`), `object_key`, `width`, `height`. PK `(media_id, name)`. URLs are built from
`object_key` at read time, so the bucket or CDN can move.

Object keys: `originals/{mediaId}` (private), `variants/{mediaId}/{name}.webp` (public-read).

## messaging

**conversations** — `id`, `type` (`direct`, `group`), `title`, `direct_key` (null for groups;
for direct chats the two member ids sorted and joined, unique, so the same pair can't start two
chats), `last_message_id`, `updated_at`, `created_at`. Index `(updated_at desc)` via
memberships.

**conversation_members** — `conversation_id`, `user_id`, `joined_at`, `last_read_message_id`,
`unread_count`. PK `(conversation_id, user_id)`; index `(user_id, conversation_id)`.
`listConversations` orders a member's conversations by `conversations.updated_at`.

**messages**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK |
| conversation_id | ULID | |
| sender_id | ULID | |
| client_message_id | text | Unique per `(conversation_id, sender_id)`: a retried send returns the stored message |
| text | text | ≤ 4000 |
| reply_to_id | ULID null | |
| created_at | timestamptz | |

Index: `(conversation_id, id desc)`. **message_media** — `message_id`, `media_id`, `position`
(≤ 4).

## notifications

**notifications**

| Column | Type | Notes |
|---|---|---|
| id | ULID | PK |
| recipient_id | ULID | |
| type | enum, the contract's `NotificationType` | |
| target_kind, target_id | | `post`, `comment`, `user`, `conversation` |
| actor_ids | ULID[] | Latest first; the contract shows up to 3 |
| actor_count | integer | |
| preview | text null | |
| read_at | timestamptz null | |
| updated_at, created_at | timestamptz | `updated_at` bumps when re-aggregated, which reorders the inbox |

Aggregation: a unique partial index on `(recipient_id, type, target_kind, target_id) where
read_at is null`. A new event upserts into it: prepend the actor and increment the count.

Index: `(recipient_id, updated_at desc)`.

**notification_preferences** — `user_id` (PK), `channels` (`jsonb`, keyed by notification
type → `{ inApp, email, push }`), `updated_at`. Missing keys mean the defaults.

Unread counts: `notifications` is the count of unread rows (cache it in Redis and invalidate on
change); `messages` is the sum of `conversation_members.unread_count` for the user.

## search

Start in PostgreSQL. Moving to a dedicated engine is a later, optional exercise.

- **Posts:** a generated `tsvector` column on `posts` (owned by content, exposed through a
  content query), with a GIN index.
- **Users:** the trigram indexes on `users` above.
- **Hashtags:** **hashtag_stats** — `tag` (PK), `post_count`, `trend_score`, `updated_at`,
  refreshed by a repeatable job from `post_hashtags` in a sliding window, with decay. This
  could also be a materialized view refreshed `CONCURRENTLY`.

The search module owns none of the source tables. It calls the other modules' public queries
and merges the results. That is the honest cost of module boundaries; feel it before
reaching for shortcuts.

## moderation

**reports** — `id`, `reporter_id`, `target_kind` (`user`, `post`, `comment`, `message`),
`target_id`, `reason` (the contract's enum), `details`, `status` (`open`, `actioned`,
`dismissed`), `created_at`. Unique `(reporter_id, target_kind, target_id) where status = 'open'`,
so reporting twice is idempotent.

## platform

**outbox** — `id` (ULID), `type`, `payload` (`jsonb`), `traceparent`, `created_at`,
`published_at` (null until relayed), `attempts`. Index `(created_at) where published_at is null`.
The relay claims batches with `FOR UPDATE SKIP LOCKED`, so two relays never send the same row.

**processed_events** — `consumer`, `event_id`, `processed_at`. PK `(consumer, event_id)`.
Consumers insert here in the same transaction as their effect.

**idempotency_keys** — `user_id`, `key`, `request_hash`, `status_code`, `response_body`,
`created_at`. PK `(user_id, key)`. Purge after 24 h.

## Redis keys

| Key | Type | Owner | Purpose |
|---|---|---|---|
| `timeline:{userId}` | sorted set (score = post id time) | feed | Home timeline, capped at `TIMELINE_MAX` |
| `celebrities` | set | feed | Authors fanned out on read |
| `suggestions:{userId}` | string (JSON) | graph | 10-minute cache |
| `unread:{userId}` | hash | notifications | Badge counts cache |
| `ratelimit:{scope}:{key}` | string / hash | platform | Token buckets |
| `ws:ticket:{ticket}` | string, 30 s TTL | platform | Single-use realtime tickets (`GETDEL`) |
| `ws:events:{userId}` | stream, ~5 min | platform | Replay buffer for `resume` |
| `ws:user:{userId}` | pub/sub channel | platform | Deliver to whichever process holds the socket |
| `presence:{userId}` | string, TTL | messaging | Online state, refreshed by heartbeats |
| `typing:{conversationId}` | hash, 5 s TTL | messaging | Typing indicators |
| `post:viewers:{postId}` | pub/sub channel | content | Live `post.stats` for subscribed posts |
| `bull:*` | | platform | BullMQ queues |
