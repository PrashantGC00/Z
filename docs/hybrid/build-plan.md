# Hybrid build plan

Eight phases. The core inherits every operation from the monolith, so most of this plan is
about the four media operations and about **proving the extraction was worth it**.

Contract status: once phase 0 runs, flip each operation to `LIVE` for `hybrid` as
`pnpm test:contract hybrid <operationId>` passes against `:8083`. Operations the monolith has
LIVE should pass as soon as the core runs. The media operations (`createMediaUpload`,
`completeMediaUpload`, `getMedia`, `deleteMedia`) flip again only after phase 5, since their
behaviour changes underneath.

| Phase | Theme |
|---|---|
| 0 | The core on its own stack |
| 1 | Media service skeleton |
| 2 | Signed upload token and the receiver |
| 3 | Core adapter: remote uploads |
| 4 | Processing in the media worker |
| 5 | Results back to the core |
| 6 | Video lane, cleanup, serving |
| 7 | Measure and break it |

---

## Phase 0 — The core on its own stack

**Steps:**
1. Write `backends/hybrid/compose.hybrid.yaml` (project `z_hybrid`). Build the core from the
   monolith Dockerfile and run it as `core-api` with `MEDIA_ADAPTER=local` for now (add
   `core-worker` and `core-relay` once monolith phase 5 has them). Give it its own Postgres,
   Redis and MinIO ([ADR-0008](../adr/0008-minio-image.md) image) on the
   [offset ports](README.md#ports), plus Jaeger.
2. Add a `:8083` server block to the root `nginx/default.conf.template`, with its own upstream
   variable, `/v1/` → core and the WebSocket upgrade ([ADR-0009](../adr/0009-shared-gateway-two-modes.md)).
3. `getHealth` must report `architecture: "hybrid"`. The architecture name is config
   (`ARCH=hybrid`, which the monolith already reads), not a code fork.
4. Run migrations and seed against the hybrid database.

**Done when:**
- The app on **Monolith + media service** works exactly like the monolith.
- `pnpm test:contract hybrid` passes for everything the monolith has LIVE; flip those.

## Phase 1 — Media service skeleton

**Steps:**
1. Scaffold `media-service` as in [structure.md](structure.md): strict TypeScript, Express 5,
   two entrypoints.
2. Platform pieces as in the [standards](../backend-standards.md): config, pino, OpenTelemetry,
   health, graceful shutdown.
3. Write a Dockerfile with FFmpeg installed and a non-root user. Add `media-receiver` and
   `media-worker` to compose.
4. Write the nginx route `/upload/` → receiver, with `client_max_body_size 200m`,
   `proxy_request_buffering off` (stream, don't spool) and long upload timeouts.

**Done when:** both media processes report healthy and show up in Jaeger.

## Phase 2 — Signed upload token and the receiver

**Steps:**
1. Token verification as in the [protocol](protocol.md#upload-token). Test expired, tampered,
   wrong-audience and reused tokens.
2. Stream the request body to `originals/{mediaId}` with `@aws-sdk/lib-storage`, counting bytes.
   Abort past `max` and clean up the partial upload.
3. Sniff the first chunk with `file-type` and reject a mismatch with `415` before storing
   anything else.
4. Handle CORS preflight for the frontend origin.

**Practises:** streaming with backpressure, validating where bytes arrive, stateless
authorization with signed tokens.

**Done when:**
- `curl` with a token minted by a test script uploads a file.
- A 16 MB image with a 15 MB token is rejected and nothing remains in MinIO.

## Phase 3 — Core adapter: remote uploads

**Steps:**
1. In `backends/monolith`, add `modules/media/infra/remote/`. `createMediaUpload` mints the
   token and returns the receiver URL.
2. Switch the hybrid core to `MEDIA_ADAPTER=remote`. Keep `completeMediaUpload` processing
   locally for now: the local processor reads the original from MinIO either way.
3. Check the boundary: `git diff` shows changes only under `modules/media/`. If not, write
   down why and fix the seam.

**Done when:** uploads from the app go through `:8083/upload/…`, and the core's logs show no
upload bytes.

## Phase 4 — Processing in the media worker

**Steps:**
1. The core's remote `MediaProcessor` writes an outbox event, and the relay enqueues
   `media.process` (job id `mediaId`).
2. The media worker: check the original exists (`missing_upload` otherwise), then generate
   variants and a blurhash using the profile for the purpose, and write them to
   `variants/{mediaId}/…`.
3. Choose concurrency from cores (`IMAGE_CONCURRENCY`). Run sharp on its own thread pool, and
   don't oversubscribe it.
4. Test with fixtures: JPEG, PNG with alpha, animated GIF, and a corrupt file.

**Done when:** after `complete`, variants appear in MinIO, written by the media worker
(Jaeger shows the span in `z-media-worker`).

## Phase 5 — Results back to the core

**Steps:**
1. The worker publishes `media.results` ([protocol](protocol.md#mediaresults-v1)).
2. The core's consumer, idempotently: upsert variants, set `ready` or `failed`, and emit
   `MediaReady`. Everything downstream (post attach, avatar URLs) works unchanged.
3. Watchdog: a core job fails media stuck in `processing` (see the
   [retry policy](protocol.md#retry-and-failure-policy)).
4. Flip the four media operations to `LIVE` for `hybrid` once their contract tests pass.

**Practises:** eventual consistency across processes, idempotent consumers, correlation across
services.

**Done when:**
- Posting photos in the app works end to end on :8083.
- A duplicated `media.results` message changes nothing.
- One trace covers `createMediaUpload` → receiver → `complete` → worker → result consumer.

## Phase 6 — Video lane, cleanup, serving

**Steps:**
1. Put video on `media.process.video` with `VIDEO_CONCURRENCY=1`. FFmpeg produces a poster frame
   and an HLS ladder (360p / 720p) with a duration cap (`too_long`).
2. Cleanup: the core's 24 h unattached-media job enqueues `media.delete`, and the worker
   removes objects.
3. Serving: `/files/*` in nginx → MinIO's public `variants/` prefix, with
   `Cache-Control: public, max-age=31536000, immutable`. Originals stay private.

**Done when:**
- A 100 MB video doesn't delay thumbnails for images uploaded right after it (the lanes are
  separate).
- Deleted or abandoned media disappears from MinIO.

## Phase 7 — Measure and break it

The phase that justifies the architecture. Write the results in `load/RESULTS.md` and an ADR.

1. **Load:** run k6 with 50 concurrent image uploads against the monolith (`:8081`) and the
   hybrid (`:8083`). Compare API p95 latency for *non-media* requests during the burst. The
   hybrid's should stay flat.
2. **Scale:** `docker compose up --scale media-worker=3`. Plot queue depth and time to `ready`.
3. **Failure drills** (from the [architecture note](../architectures/hybrid.md#failure-modes-worth-testing)):
   - stop `media-receiver`: uploads fail, while text posts, chat and the feed keep working;
   - stop `media-worker`: uploads wait in `processing` and drain on restart;
   - kill a worker mid-job: the job retries and the result arrives once;
   - send a poison file: the job is marked `failed` and the worker survives.
4. **Observability:** a Grafana dashboard with queue depth per lane, job duration, failures by
   reason, and receiver throughput.
5. **Secret rotation:** rotate `UPLOAD_TOKEN_SECRET` with the two-key overlap, without
   breaking uploads in flight.

**Done when:** the [architecture note's practice checklist](../architectures/hybrid.md#practice-checklist)
is fully ticked and the ADR states, with numbers, what the split bought and what it cost.

## Optional — Rewrite the media service

With the protocol stable, reimplement `media-service` in Rust (Axum, the `image` crate) or Go.
The core shouldn't notice. This is the same service as `media-svc` in the
[microservices](../microservices/) build, so the work carries over.
