# Service catalog

Every contract operation is served by exactly one service; nginx routes by path. Each service
owns its data: no other service reads its database. Other services get that data through its
gRPC API or by consuming its events.

## Operation → service map

| Service | Operations | Count |
|---|---|---|
| identity-svc | `getHealth`*, `register`, `login`, `refreshTokens`, `logout`, `getMe`, `updateMe`, `getUserProfile` | 8 |
| graph-svc | `followUser`, `unfollowUser`, `listFollowers`, `listFollowing`, `blockUser`, `unblockUser`, `listSuggestedUsers` | 7 |
| post-svc | `createPost`, `getPost`, `updatePost`, `deletePost`, `listUserPosts`, `likePost`, `unlikePost`, `listPostLikes`, `sharePost`, `bookmarkPost`, `unbookmarkPost`, `listBookmarks`, `listHashtagPosts` | 13 |
| media-svc | `createMediaUpload`, `completeMediaUpload`, `getMedia`, `deleteMedia` | 4 |
| feed-svc | `getHomeFeed` | 1 |
| comment-svc | `listComments`, `createComment`, `updateComment`, `deleteComment`, `likeComment`, `unlikeComment` | 6 |
| notification-svc | `listNotifications`, `getUnreadCounts`, `markNotificationRead`, `markAllNotificationsRead`, `getNotificationPreferences`, `updateNotificationPreferences` | 6 |
| realtime-gateway | `createRealtimeTicket`, plus the WebSocket at `/v1/realtime` | 1 |
| chat-svc | `listConversations`, `createConversation`, `getConversation`, `listMessages`, `sendMessage`, `markConversationRead` | 6 |
| story-svc | `listStoryReel`, `createStory`, `deleteStory`, `markStoryViewed` | 4 |
| search-svc | `search`, `listTrendingHashtags` | 2 |
| moderation-svc | `createReport` | 1 |
| **Total** | | **59** |

\* `getHealth` starts on identity-svc, the first service built. A stretch goal is a small
aggregator that reports `degraded` when any service's `/readyz` fails.

## Cross-cutting decisions

| Decision | Choice | Why |
|---|---|---|
| Auth | identity-svc signs EdDSA JWTs and serves its public keys at an internal `/.well-known/jwks.json`. **Every service verifies tokens locally** with a cached JWKS. nginx only routes | No auth hop per request; each language practises JWT verification |
| User data in other services | Services that render authors (post, comment, chat, story, notification) keep a **local replica** of `UserSummary`, updated from `user.updated` events | Hydration without a gRPC call per item; practises data duplication and eventual consistency |
| Relationship checks | `graph-svc.CheckRelationships` over gRPC (batch), cached for 30 s per viewer | Visibility and blocks are needed on most reads, and must be fresh-ish |
| Composition | The service that owns the response assembles it. Call depth is at most 2 | Avoids chains of synchronous calls |
| IDs and cursors | ULIDs everywhere; cursors opaque per service | ADR-0005 |

## identity-svc · Express TS · PostgreSQL

**Data:** `users` (with `posts_count`, `followers_count` and `following_count`, maintained
from events), `credentials`, `refresh_tokens`, `outbox`, `processed_events`. The same design
as the [monolith's identity tables](../monolith/data-model.md#identity).

**gRPC:** `UserService.BatchGetUsers(ids)`, `UserService.GetByUsername(username)`.

**Publishes:** `user.registered`, `user.updated` (topic `z.user.v1`).

**Consumes:**
- `user.followed` and `user.unfollowed` → follower and following counters;
- `post.created` and `post.deleted` → the posts counter;
- `media.ready` (avatars and covers).

**Notes:** `getUserProfile` composes the user row with `graph-svc.CheckRelationships`.
Counters are eventually consistent: note the trade-off in an ADR.

## graph-svc · Go Fiber · PostgreSQL

**Data:** `follows`, `blocks`, `outbox`, `processed_events`. The same shape as the monolith's.

**gRPC:**
- `CheckRelationships(viewer, targets[])` → `{ following, followedBy, blocking, blockedBy }`;
- `ListFollowerIds(userId, cursor, pageSize)` (feed fan-out);
- `IsBlocked(a, b)`.

**Publishes:** `user.followed`, `user.unfollowed`, `user.blocked`, `user.unblocked` (topic
`z.graph.v1`, keyed by follower id).

**Consumes:** `user.registered`, for suggestions' "new users".

**Notes:** suggestions use friends-of-friends SQL, cached in its own Redis keyspace.

## post-svc · FastAPI · PostgreSQL

**Data:** `posts`, `post_media`, `post_hashtags`, `post_mentions`, `post_likes`, `bookmarks`,
`idempotency_keys`, `user_replica`, `outbox`, `processed_events`. See the
[monolith content tables](../monolith/data-model.md#content).

**gRPC:** `BatchGetPosts(ids, viewerId)` (hydrated, visibility-filtered),
`GetPostAccess(postId, viewerId)` (for comment-svc).

**Publishes:** `post.created`, `post.updated`, `post.deleted`, `post.liked`, `post.unliked`,
`post.shared` (topic `z.post.v1`, keyed by **author id**, so one author's posts stay ordered
for feed-svc).

**Consumes:**
- `user.updated` → the replica;
- `media.ready`;
- `comment.created` and `comment.deleted` → `comments_count`.

**Calls:** `media-svc.ClaimMedia(ids, owner, purpose)` on create;
`graph-svc.CheckRelationships` on reads.

## media-svc · Rust Axum · PostgreSQL + MinIO

**Data:** `media`, `media_variants`, `outbox`. Objects in MinIO as in the
[hybrid protocol](../hybrid/protocol.md).

**gRPC:**
- `ClaimMedia(ids, ownerId, purpose)`: atomically marks media as attached, and fails if any id
  isn't ready, owned or free;
- `BatchGetMedia(ids)`.

**Publishes:** `media.ready`, `media.failed` (topic `z.media.v1`).

**Notes:** uploads go straight to MinIO via pre-signed URLs, as in the monolith. Processing
runs in-process on a Tokio blocking pool with the `image` crate, plus FFmpeg for video. A
repeatable task garbage-collects unclaimed media.

## feed-svc · Go Fiber · Redis

**Data:** `timeline:{userId}` sorted sets, `celebrities` set, `processed_events` (in Redis,
with a TTL).

**Consumes:**
- `post.created` → fan out (pages follower ids from graph-svc);
- `post.deleted`;
- `user.followed` → backfill;
- `user.unfollowed` and `user.blocked` → lazy cleanup.

**Calls:** `graph-svc.ListFollowerIds`; `post-svc.BatchGetPosts` for hydration.

**Notes:** one consumer group; batched, pipelined `ZADD`s. Rebuilding a cold timeline needs
"recent posts by these authors", so post-svc also exposes `ListRecentPostIds(authorIds, since)`.

## comment-svc · FastAPI · MongoDB

**Data:** `comments` documents `{ _id: ulid, postId, parentId, authorId, text, likes,
replyCount, version, editedAt, deletedAt }`, with index `{ postId: 1, parentId: 1, _id: 1 }`.
Also `comment_likes` (unique `{ commentId, userId }`), `user_replica`, and `outbox` (written in
the same multi-document transaction, which needs a replica set).

**Publishes:** `comment.created`, `comment.deleted`, `comment.liked` (topic `z.comment.v1`).

**Calls:** `post-svc.GetPostAccess` before reading or writing a post's comments.

## notification-svc · Express TS · MongoDB

**Data:**
- `notifications`: aggregated documents with a partial unique index on
  `{ recipientId, type, target.kind, target.id }` where `read: false`, and a TTL index on
  `createdAt` (90 days);
- `preferences`;
- `unread` counters;
- `processed_events`.

**Consumes:** `user.followed`, `post.liked`, `post.shared`, `comment.created`, `comment.liked`,
mentions in `post.created`, and `message.created` (the message badge only).

**Publishes:** `notification.created`, `unread.changed` (topic `z.notification.v1`), for
realtime-gateway.

## realtime-gateway · Go Fiber · Redis

**Data:**
- tickets (`ws:ticket:*`, 30 s);
- the connection registry (`ws:conn:{userId}` → gateway instance ids);
- per-user replay streams (5 min).

**Serves:** `createRealtimeTicket`, and the WebSocket (ping/pong, `resume`, `subscribe`,
`typing`).

**Consumes:**
- `message.created`, `conversation.read` and `typing` (from chat-svc);
- `notification.created`, `unread.changed`;
- `post.stats` (a throttled projection of like, comment and share events).

**Notes:** each instance consumes with its own consumer group and delivers only to sockets it
holds, *or* one shared group routes via Redis pub/sub to the owning instance. Try both and
record the trade-off.

## chat-svc · Rust Axum · MongoDB

**Data:**
- `conversations` `{ _id, type, title, directKey (unique, sparse), members: [{ userId,
  lastReadMessageId, unreadCount }], lastMessage, updatedAt }`, with index
  `{ "members.userId": 1, updatedAt: -1 }`;
- `messages` `{ _id: ulid, conversationId, senderId, clientMessageId, text, mediaIds,
  replyToId }`, with indexes `{ conversationId: 1, _id: -1 }` and unique
  `{ conversationId: 1, senderId: 1, clientMessageId: 1 }`;
- `user_replica`, `outbox`.

**Publishes:** `message.created`, `conversation.read`, `typing` (topic `z.chat.v1`, keyed by
conversation id, so a conversation's messages stay ordered).

**Calls:** `graph-svc.IsBlocked` before creating direct chats; `media-svc.ClaimMedia` for
attachments.

## story-svc · FastAPI · MongoDB

**Data:** `stories` `{ _id, authorId, mediaId, caption, createdAt, expiresAt }` with a **TTL
index on `expiresAt`** (MongoDB deletes expired stories itself); `story_views` (unique
`{ storyId, viewerId }`); `user_replica`.

**Publishes:** `story.created`, `story.deleted` (topic `z.story.v1`).

**Calls:** `graph-svc` for "people I follow" when building the reel, cached per viewer.
`media-svc.ClaimMedia`.

## search-svc · Rust Axum · tantivy

**Data:** an embedded tantivy index on a volume (users, posts, hashtags) and `trending` scores in
memory, snapshotted to disk.

**Consumes:** `user.registered`, `user.updated`, `post.created`, `post.updated`, `post.deleted`,
`user.blocked`.

**Notes:** the index is a projection. Deleting it and replaying the topics from the beginning
must rebuild it exactly; that's a practice item. Results are visibility-filtered with
`graph-svc.CheckRelationships` before returning.

## moderation-svc · FastAPI · PostgreSQL

**Data:** `reports` (as in the [monolith](../monolith/data-model.md#moderation)), `outbox`.

**Publishes:** `report.created` (topic `z.moderation.v1`).

**Notes:** checks that the target exists via the owning service's gRPC API. A natural place for
an ML classifier later.
