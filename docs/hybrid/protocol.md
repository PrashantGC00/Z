# Core ↔ media service protocol

The core and the media service share no code and no database. This page is their entire
contract, the internal equivalent of `api/openapi.yaml`. Version it the same way: add optional
fields freely, bump `v` for anything else, and have consumers accept the previous version
during a rollout.

## Upload token

Minted by the core in `createMediaUpload`, verified by the receiver. JWT, HS256, shared secret.

| Claim | Example | Checked by the receiver |
|---|---|---|
| `sub` | media id (ULID) | Must equal `:mediaId` in the URL |
| `own` | owner user id | Logged only |
| `ct` | `image/jpeg` | The sniffed type must match, else `415` |
| `max` | `15728640` | Bytes counted while streaming; abort with `413` past it |
| `pur` | `post` | Picks the processing profile |
| `exp` | 15 minutes | Expired → `401` |
| `aud` | `z-media` | Must match |
| `jti` | random | Single use: stored in Redis on success; reuse → `409` |

`uploadUrl = {MEDIA_UPLOAD_BASE_URL}/{mediaId}?token={jwt}`, with `method: PUT` and the
headers the browser must send (`Content-Type`). The contract types `uploadUrl` as a URI, so it
is absolute.

## Receiver: `PUT /upload/{mediaId}?token=…`

| Outcome | Status | Notes |
|---|---|---|
| Stored at `originals/{mediaId}` | `201` | Empty body. The browser then calls the core's `complete` |
| Bad or expired token | `401` | |
| Token reused | `409` | |
| Over `max` | `413` | Abort the multipart upload; nothing is left in MinIO |
| Sniffed type ≠ `ct` | `415` | |
| Preflight `OPTIONS` | `204` | `Access-Control-Allow-Origin: http://localhost:5173`, `-Methods: PUT`, `-Headers: Content-Type` |

The receiver never writes to the core's database and never calls the core.

## Queues (BullMQ on the shared Redis)

| Queue | Producer → consumer | Job id | Purpose |
|---|---|---|---|
| `media.process` | core → media worker (images) | `mediaId` | Process an uploaded image |
| `media.process.video` | core → media worker (video) | `mediaId` | A separate lane, so a long video can't starve thumbnails |
| `media.results` | media worker → core | `{mediaId}-{attempt}` (BullMQ rejects `:` in custom job ids) | Report ready or failed |
| `media.delete` | core → media worker | `mediaId` | Remove originals and variants |

Using `mediaId` as the job id makes enqueueing idempotent: BullMQ ignores a duplicate while the
first job exists. The core enqueues from its outbox relay, never directly inside a request.

### `media.process` / `media.process.video` (v1)

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | |
| `mediaId` | ULID | |
| `kind` | `image` \| `video` | |
| `purpose` | `post` \| `story` \| `avatar` \| `cover` \| `message` | Avatars get square crops; stories get 9:16 |
| `contentType` | string | As declared and checked |
| `originalKey` | `originals/{mediaId}` | |
| `traceparent` | W3C | Continues the trace from `completeMediaUpload` |

### `media.results` (v1)

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | |
| `mediaId` | ULID | |
| `status` | `ready` \| `failed` | |
| `failureReason` | `missing_upload` \| `unsupported` \| `corrupt` \| `too_long` \| `internal` | When `failed` |
| `width`, `height`, `durationMs`, `blurhash` | | When `ready` |
| `variants` | `{ name, key, width, height }[]` | Keys under `variants/{mediaId}/` |
| `traceparent` | W3C | |

The core's consumer:
1. ignores results for media already `ready` (idempotent);
2. upserts `media_variants`;
3. sets the status;
4. emits `MediaReady` on its event bus, the same as the monolith's local worker did.

### `media.delete` (v1)

`{ v, mediaId, keys: string[] }`. Deleting a missing object counts as success.

## Retry and failure policy

| Where | Policy |
|---|---|
| Media worker job | 3 attempts, exponential backoff with jitter. Then it publishes `failed` (`internal`) and the job lands in the failed set |
| Poison input (sharp or FFmpeg crash) | Run in a child process or with timeouts, so one file can't take the worker down. Report `corrupt` |
| Core results consumer | Retries on database errors; the job stays until it's processed |
| Core never hears back | A repeatable core job marks media `processing` for more than 10 min as `failed` (`internal`), and re-enqueues once before that |
