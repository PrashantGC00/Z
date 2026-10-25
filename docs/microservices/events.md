# Events and gRPC

How services talk. Synchronous reads go over **gRPC**; everything that changes state elsewhere
goes over **Kafka** (Redpanda) as events. The rules here hold in all four languages.

## Topics

| Topic | Producer | Key | Events |
|---|---|---|---|
| `z.user.v1` | identity-svc | user id | `user.registered`, `user.updated` |
| `z.graph.v1` | graph-svc | follower / blocker id | `user.followed`, `user.unfollowed`, `user.blocked`, `user.unblocked` |
| `z.post.v1` | post-svc | author id | `post.created`, `post.updated`, `post.deleted`, `post.liked`, `post.unliked`, `post.shared` |
| `z.media.v1` | media-svc | media id | `media.ready`, `media.failed` |
| `z.comment.v1` | comment-svc | post id | `comment.created`, `comment.deleted`, `comment.liked` |
| `z.chat.v1` | chat-svc | conversation id | `message.created`, `conversation.read`, `typing` |
| `z.notification.v1` | notification-svc | recipient id | `notification.created`, `unread.changed` |
| `z.story.v1` | story-svc | author id | `story.created`, `story.deleted` |
| `z.moderation.v1` | moderation-svc | target id | `report.created` |

- **One topic per producing service**, with the event type in the envelope. The key decides
  ordering: events with the same key stay in order.
- Start with 6 partitions per topic, replication factor 1 locally.
- **Retention:** 7 days by default. `z.user.v1` and `z.post.v1` are compacted *or* kept
  longer, so search-svc can rebuild by replay. Decide which, and write an ADR.
- **Dead letters:** a consumer that fails an event N times publishes it to `<topic>.dlq.<consumer>`
  and moves on. Inspect DLQs in Redpanda Console.
- **Consumer groups** are named after the consuming service (`feed-svc`, `search-svc`, …).

## Envelope

Every event, in every language, is JSON with this shape:

| Field | Type | Notes |
|---|---|---|
| `id` | ULID | Unique. Consumers deduplicate on it |
| `type` | string | `post.created` |
| `version` | integer | Payload schema version, starting at 1 |
| `occurredAt` | RFC 3339 | When the change committed |
| `producer` | string | `post-svc` |
| `key` | string | The partition key, repeated for convenience |
| `traceparent` | string | W3C. Consumers continue the trace from it |
| `data` | object | The payload |

Also set Kafka headers `type`, `version` and `traceparent`, so tools can filter without parsing.

**Evolution:** adding optional fields is fine. Removing or retyping a field needs a new
`version`; producers emit the old version until every consumer handles the new one. Describe
each payload in `proto/events/` (as protobuf messages used only as a schema), or in JSON Schema
next to the producer. Pick one and record it in an ADR.

## Transactional outbox, per language

The write and the event commit together; a relay publishes afterwards.

| Service type | Outbox write | Relay |
|---|---|---|
| PostgreSQL (TS, Go, Python, Rust) | `INSERT INTO outbox` in the use case's transaction | A loop in the service process: claim unpublished rows with `FOR UPDATE SKIP LOCKED`, produce with `acks=all` and idempotence on, mark published |
| MongoDB (Python, TS, Rust) | Insert into an `outbox` collection inside the same multi-document transaction (needs the replica set) | The same loop, or a **change stream** on the outbox collection |

Alternative to try once: Redpanda Connect or Debezium reading the Postgres WAL (CDC) instead of
a polling relay. Compare latency and operational cost in an ADR.

## Idempotent consumers

Delivery is at-least-once, so every consumer is safe to run twice:

1. Begin a transaction in your own database.
2. Insert `(consumer, event id)` into `processed_events`. If it already exists, skip.
3. Apply the effect.
4. Commit, *then* commit the Kafka offset.

For Redis-only services (feed-svc), make the effect naturally idempotent (`ZADD` of the same
member is a no-op) and keep processed ids in a set with a TTL.

**Libraries:**

| Language | Producer / consumer |
|---|---|
| TypeScript | `@confluentinc/kafka-javascript` |
| Go | `franz-go` |
| Rust | `rdkafka` |
| Python | `aiokafka` |

## gRPC

```
proto/
  buf.yaml                lint (DEFAULT) + breaking-change detection against main
  buf.gen.yaml            one plugin set per language, output into each service
  z/
    identity/v1/user_service.proto
    graph/v1/graph_service.proto
    post/v1/post_service.proto
    media/v1/media_service.proto
    common/v1/page.proto  shared cursor/page messages
  events/                 (optional) payload schemas for Kafka events
```

**Conventions:**
- Packages are `z.<service>.v1`. Each RPC takes its own `XxxRequest` and returns its own
  `XxxResponse`, never a bare shared message, so each can evolve on its own.
- Batch by default (`BatchGetPosts`, not `GetPost` in a loop). Cap batch sizes in the request
  validation.
- Every call carries a **deadline** (default 300 ms for reads) and propagates trace context via
  OpenTelemetry interceptors.
- Clients retry only `UNAVAILABLE`, with backoff and jitter, within the deadline. They wrap
  calls in a **circuit breaker** and have a defined fallback (for example, hide counts rather
  than fail the page).
- Map errors to gRPC status codes (`NOT_FOUND`, `PERMISSION_DENIED`, `INVALID_ARGUMENT`), and
  the HTTP edge maps them back to problem+json.
- `buf breaking` runs in CI: a breaking proto change fails the build.

**Libraries:**

| Language | gRPC library |
|---|---|
| TypeScript | `@grpc/grpc-js` + `ts-proto` |
| Go | `grpc-go` |
| Rust | `tonic` + `prost` |
| Python | `grpcio` + `grpcio-tools`, or `betterproto` |
