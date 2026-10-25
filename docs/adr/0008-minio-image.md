# ADR-0008: Run MinIO from the frozen Bitnami legacy image

**Status:** Accepted · **Date:** 2026-10-25

## Context

Every backend uses MinIO as local S3-compatible storage. In late 2025 MinIO stopped publishing
free Docker images: `minio/minio`, `minio/mc` and the `quay.io/minio/*` mirrors now fail with
`pull access denied`, and one image that cannot be pulled stops `docker compose up` for the
whole stack.

Pullable alternatives checked on 2026-10-25:

| Image | Trade-off |
|---|---|
| `bitnamilegacy/minio` | Still MinIO, versioned tags, but frozen (no further updates) |
| `chrislusf/seaweedfs` | Maintained and S3-compatible, but a different server; pre-signed uploads and bucket CORS would need re-checking |
| `cgr.dev/chainguard/minio` | Maintained, but the free tier only serves `:latest`, so it cannot be pinned |

## Decision

Use **`bitnamilegacy/minio:2025.7.23-debian-12-r5`** in every backend's compose file. Local
development only needs the S3 API, so a frozen image is acceptable, and it keeps the MinIO
steps in the build plans (pre-signed URLs, bucket CORS, `mc`) unchanged.

The image differs from the official one:

- It starts the server itself; compose needs no `command:`.
- Data lives at `/bitnami/minio/data`, not `/data`.
- `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` work as before.
- `MINIO_DEFAULT_BUCKETS` (comma-separated) creates buckets on start, so no separate `mc`
  init container is needed. For anything more (policies, CORS), use
  `bitnamilegacy/minio-client`.
- For the healthcheck, confirm `mc` is in the image before using `mc ready local`; otherwise
  check `http://localhost:9000/minio/health/live`.

## Consequences

- Compose files pin one known MinIO version; no `:latest`.
- The image gets no security fixes. It must never be used outside local development.
- If the frozen image ever stops working, revisit this ADR; SeaweedFS is the first fallback.
