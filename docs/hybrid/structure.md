# Hybrid project structure

## Reusing the monolith, not copying it

The hybrid core **is the monolith**: the same source and the same image, started with
`MEDIA_ADAPTER=remote`. Only `modules/media/infra` has a second adapter, selected at startup.
That is the claim the [architecture note](../architectures/hybrid.md#the-seam) makes, and
building it this way tests the claim: if anything outside `modules/media` needs an `if hybrid`,
the boundary leaked.

```
backends/monolith/src/modules/media/
  application/ports.ts      MediaStorage, MediaProcessor (unchanged)
  infra/
    local/                  Pre-signed MinIO PUT + in-process sharp worker (monolith)
    remote/                 Signed upload token + media.process producer + media.results consumer (hybrid)
    index.ts                Picks the adapter from MEDIA_ADAPTER
```

The alternative is to fork the monolith into `backends/hybrid/core` at a tagged commit. It is
simpler to reason about, but every later monolith fix then has to be ported by hand. Choose
reuse unless the two must diverge, and record the choice in an ADR.

## backends/hybrid

```
backends/hybrid/
  media-service/
    src/
      receiver.ts           Entrypoint: the upload HTTP server (PUT /upload/:mediaId)
      worker.ts             Entrypoint: BullMQ consumers for media.process and media.delete
      receiver/
        upload.route.ts     Verify token → stream body to MinIO with limits → 201
        token.ts            Upload token verification (shared secret, claims, expiry)
        sniff.ts            Magic-byte detection on the first chunk
        cors.ts             Preflight for PUT from http://localhost:5173
      processing/
        image.ts            sharp: variants + blurhash
        video.ts            FFmpeg child process: poster frame, HLS ladder
        pipeline.ts         Pick a lane by kind, run steps, build the result message
      queues/
        process.consumer.ts media.process (images) and media.process.video lanes
        delete.consumer.ts  media.delete
        results.producer.ts media.results
      platform/             config, logger, telemetry, storage (S3 client), shutdown, health
    test/
      receiver.test.ts      Token, size and type rejections; streaming to a Testcontainers MinIO
      pipeline.test.ts      Fixtures: small JPEG, PNG with alpha, animated GIF, short MP4, a fake
      fixtures/             Tiny sample files (a few KB each)
    Dockerfile              Multi-stage, non-root, includes FFmpeg; one image, two entrypoints
    .env.example
    package.json
    tsconfig.json
  load/
    uploads.js              k6: concurrent image uploads end to end
  observability/            Prometheus scrape config, Grafana dashboard for queues and workers
  docker-compose.yml        Core (api, worker, relay) from ../monolith, media receiver and worker,
                            Postgres, Redis, MinIO, Jaeger
  Makefile                  up, dev, test, load, chaos-* targets
  README.md
```

The gateway is not in this folder. Per [ADR-0009](../adr/0009-shared-gateway-two-modes.md),
the `:8083` server (`/v1` → core, `/upload` → receiver, `/files` → MinIO public prefix) is
another `server` block and upstream variables in the root `nginx/`.

The media service has the same layering idea as a monolith module, but it is small. It has
no database and no domain model beyond "a job". Don't add layers it doesn't need.

## Compose services

| Service | Image | Command | Scales |
|---|---|---|---|
| `core-api` | `../monolith` | `main` | Yes, behind nginx |
| `core-worker` | `../monolith` | `worker`, `MEDIA_ADAPTER=remote` | Rarely |
| `core-relay` | `../monolith` | `relay` | One (or more, with `SKIP LOCKED`) |
| `media-receiver` | `./media-service` | `receiver` | On concurrent uploads |
| `media-worker` | `./media-service` | `worker` | **On CPU: this is the point** |
| `postgres`, `redis`, `minio`, `jaeger` | upstream | | |

## Configuration

The core uses the monolith's `.env` variables, plus:

| Variable | Example | Notes |
|---|---|---|
| `MEDIA_ADAPTER` | `remote` | |
| `MEDIA_UPLOAD_BASE_URL` | `http://localhost:8083/upload` | Where `uploadUrl` points |
| `MEDIA_UPLOAD_TOKEN_SECRET` | 32+ random bytes | Shared with the media service; HS256 |
| `MEDIA_UPLOAD_TOKEN_TTL` | `15m` | |
| `MEDIA_PUBLIC_BASE_URL` | `http://localhost:8083/files` | Variant URLs |

The media service uses:

| Variable | Example |
|---|---|
| `PORT` | `3200` |
| `UPLOAD_TOKEN_SECRET` | Same value as the core's |
| `CORS_ORIGINS` | `http://localhost:5173` |
| `REDIS_URL`, `S3_*` | Same Redis and MinIO as the core |
| `IMAGE_CONCURRENCY`, `VIDEO_CONCURRENCY` | `4`, `1` |
| `OTEL_SERVICE_NAME` | `z-media-receiver` / `z-media-worker` |

Rotate the shared secret by accepting two (`current`, `previous`) for one token TTL.
