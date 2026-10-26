# Microservices project structure

## Repository layout

```
backends/microservices/
  proto/                      gRPC contracts + buf config (see events.md)
  services/
    identity-svc/             Express TS
    graph-svc/                Go Fiber
    post-svc/                 FastAPI
    media-svc/                Rust Axum
    feed-svc/                 Go Fiber
    comment-svc/              FastAPI
    notification-svc/         Express TS
    realtime-gateway/         Go Fiber
    chat-svc/                 Rust Axum
    story-svc/                FastAPI
    search-svc/               Rust Axum
    moderation-svc/           FastAPI
  deploy/
    compose/
      docker-compose.yml      Infrastructure: Redpanda, Postgres, MongoDB (replica set), Redis, MinIO, observability
      services.yml            The twelve services (compose `include` or `-f` overlay)
      postgres-init/          Creates one database and one role per Postgres-owning service
      mongo-init/             Initiates the single-node replica set; one database per service
      redpanda-init/          Creates topics with partitions and retention
    observability/
      otel-collector.yaml     One collector: OTLP in → Jaeger + Prometheus out
      prometheus.yml
      grafana/                Dashboards: per-service RED, Kafka consumer lag, gRPC latency
    k8s/                      (phase 12, optional) k3d cluster config + one Helm chart per service
  load/                       k6 scripts
  Makefile                    up, down, proto, migrate-all, seed, test-all, logs svc=…
  README.md
```

Each service is self-contained: its own dependencies, Dockerfile, migrations, tests, README
and `.env.example`. Nothing outside `proto/` is shared between services. Duplicating a small
helper is cheaper than coupling services through a shared library. When a pattern repeats
four times, write it down as a convention here, not as a package.

## The paved road: what every service has

Whatever the language, a service is not "started" until it has all of these. Build them once
per language (phases 0–4), then copy the pattern.

| Concern | Requirement |
|---|---|
| Layout | The language's skeleton below, with the same layer names |
| Config | Env vars validated at startup; `.env.example` |
| HTTP | The contract's error format (problem+json with `traceId`), CORS, request validation |
| Auth | Local JWT verification against identity-svc's JWKS (cached, refreshed on unknown `kid`) |
| gRPC | Server and clients with deadlines, retries, circuit breakers and OTel interceptors |
| Events | Outbox + relay if it publishes; idempotent consumer if it consumes; DLQ |
| Observability | JSON logs with trace ids, OTLP traces, Prometheus `/metrics`, `/livez`, `/readyz` |
| Lifecycle | Graceful shutdown: drain HTTP, stop consuming, flush the producer, close pools |
| Data | Versioned migrations run by a separate command; seed data |
| Tests | Unit, integration with Testcontainers, HTTP; contract tests through the gateway |
| Container | Multi-stage Dockerfile, non-root user, healthcheck, minimal final image |
| CI | A job with path filters: lint, test, build image, `buf breaking` |
| Docs | README with run, test and dependencies; the operations it owns |

## Service skeletons

The same four layers in every language: **transport** (HTTP / gRPC / consumers) →
**application** (use cases) → **domain** (pure rules) → **store** (database adapters).

### Express TS (identity-svc, notification-svc)

```
services/identity-svc/
  src/
    main.ts                   Starts HTTP, gRPC server, relay, consumers
    config.ts
    http/                     Routers + presenters
    grpc/                     Service implementations (generated stubs in gen/)
    consumers/                Kafka handlers
    application/              Use cases + ports
    domain/
    store/                    Drizzle (Postgres) or mongodb driver repositories
    platform/                 logger, telemetry, problem handler, jwks, outbox, kafka
    gen/                      buf output (ignored by lint)
  migrations/                 drizzle-kit
  test/
  Dockerfile  package.json  tsconfig.json  .env.example  README.md
```

### Go Fiber (graph-svc, feed-svc, realtime-gateway)

```
services/graph-svc/
  cmd/graph-svc/main.go       Wires config → stores → app → transports; handles signals
  internal/
    config/
    http/                     Fiber handlers + presenters
    grpcserver/
    consumer/                 franz-go consumers
    app/                      Use cases; interfaces for stores
    domain/
    store/                    pgx + sqlc generated queries
    platform/                 logging (slog), otel, problem, jwks, outbox
  gen/                        buf output
  db/
    migrations/               goose or golang-migrate
    queries/                  .sql files for sqlc
  sqlc.yaml  go.mod  Dockerfile  .env.example  README.md
```

### Rust Axum (media-svc, chat-svc, search-svc)

```
services/chat-svc/
  src/
    main.rs                   Tokio runtime; builds state; spawns HTTP, gRPC, relay, consumers
    config.rs
    http/                     Axum routers, extractors, problem responses
    grpc/                     tonic services
    consumer/                 rdkafka stream consumers
    app/                      Use cases; traits for stores
    domain/
    store/                    sqlx (Postgres) or the mongodb crate
    platform/                 tracing + opentelemetry, jwks, outbox
  migrations/                 sqlx migrate (Postgres services)
  build.rs                    tonic-build from ../../proto
  Cargo.toml  Dockerfile  .env.example  README.md
```

### FastAPI (post-svc, comment-svc, story-svc, moderation-svc)

```
services/post-svc/
  app/
    main.py                   FastAPI app; lifespan starts relay, consumers, gRPC server
    config.py                 pydantic-settings
    api/                      Routers + response models (Pydantic v2)
    grpc/                     grpcio aio servicers
    consumers/                aiokafka consumers
    services/                 Use cases
    domain/
    repositories/             SQLAlchemy 2 async (Postgres) or PyMongo async (Mongo)
    platform/                 logging (structlog), otel, problem handlers, jwks, outbox
  alembic/                    Migrations (Postgres services)
  tests/
  pyproject.toml              uv-managed; ruff + mypy (strict) + pytest
  Dockerfile  .env.example  README.md
```

## Gateway routing

The `:8082` gateway lives in the root `nginx/` with the others ([ADR-0009](../adr/0009-shared-gateway-two-modes.md)).
It routes by path prefix to the owning service ([service catalog](services.md)). Some routes
need care:

| Path | Service | Note |
|---|---|---|
| `/v1/users/{username}/posts` | post-svc | More specific than `/v1/users/` (identity-svc): order matters |
| `/v1/users/{username}/follow`, `/block`, `/followers`, `/following` | graph-svc | Same |
| `/v1/posts/{id}/comments` | comment-svc | More specific than `/v1/posts/` |
| `/v1/hashtags/trending` | search-svc | `/v1/hashtags/{tag}/posts` → post-svc |
| `/v1/realtime` | realtime-gateway | WebSocket upgrade, long read timeout |

Use regex `location`s, and test every contract path against the routing table, ideally with a
small script that reads `api/openapi.yaml`. A wrong route shows up as a 404 that looks like a
bug in the service.
