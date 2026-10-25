# Building the microservices

The plan for `backends/microservices`: twelve services in four languages (Express TS, Go
Fiber, Rust Axum, Python FastAPI), each with its own PostgreSQL or MongoDB database, talking
over gRPC and Kafka (Redpanda). Served at `http://localhost:8082/v1` through nginx. It is built
after the monolith, cutting along the seams the monolith revealed.

## Read in this order

| Doc | What it gives you |
|---|---|
| [Architecture note](../architectures/microservices.md) | *What* and *why*: services, language and database pairings, how the hard flows work, trade-offs |
| [Project structure](structure.md) | Repo layout, the per-language service skeletons, the "paved road" every service follows |
| [Service catalog](services.md) | Each service: the operations it serves, its data, the events it publishes and consumes, its gRPC API |
| [Events and gRPC](events.md) | Topics, the event envelope, outbox and idempotent consumers in each language, proto conventions |
| [Build plan](build-plan.md) | 13 phases from shared infrastructure to all 59 operations LIVE, then resilience work |
| [Backend standards](../backend-standards.md) | The bar every operation meets, in every language |

## Ports

| Service | Port (host) | Language |
|---|---|---|
| nginx gateway | **8082** | — |
| identity-svc | 4001 | Express TS |
| graph-svc | 4002 | Go Fiber |
| post-svc | 4003 | FastAPI |
| media-svc | 4004 | Rust Axum |
| feed-svc | 4005 | Go Fiber |
| comment-svc | 4006 | FastAPI |
| notification-svc | 4007 | Express TS |
| realtime-gateway | 4008 | Go Fiber |
| chat-svc | 4009 | Rust Axum |
| story-svc | 4010 | FastAPI |
| search-svc | 4011 | Rust Axum |
| moderation-svc | 4012 | FastAPI |
| gRPC | HTTP port + 1000 (5001–5012) | |
| PostgreSQL / MongoDB / Redis | 5434 / 27017 / 6381 | |
| Redpanda (Kafka) / Console | 19092 / 8180 | |
| MinIO API / console | 9004 / 9005 | |
| Jaeger / Prometheus / Grafana | 16688 / 9091 / 3031 | |

## Milestones at a glance

| Milestone | Phases | Operations LIVE | You can… |
|---|---|---|---|
| **Paved road** | 0 | 1 / 59 | Run every dependency, the gateway and one healthy service |
| **Sign in** | 1 | 7 | Register and sign in through identity-svc |
| **Polyglot core** | 2–4 | 32 | Follow, post with photos, like and share, across Go, Python and Rust services |
| **Event-driven feed** | 5 | 33 | See Home built by feed-svc from Kafka events |
| **Conversation** | 6–8 | 52 | Comment, get notified live, chat in real time |
| **Complete** | 9–11 | 59 | Stories, search, trending, reports |
| **Resilient** | 12 | 59 | Survive killed services, replay topics, trace any request |
