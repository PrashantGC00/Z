# Architecture decision records

Short records of decisions that shape the whole project, using the
[Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
context, decision, consequences. Add a new numbered file rather than editing an accepted one;
mark the old one *Superseded by ADR-NNNN*.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-contract-first-api.md) | Contract-first API shared by every backend | Accepted |
| [0002](0002-three-architectures.md) | Build it as a modular monolith, microservices and serverless | Superseded by 0007 |
| [0003](0003-auth-tokens.md) | JWT access tokens with rotating refresh tokens | Accepted |
| [0004](0004-realtime-websocket-tickets.md) | WebSocket with ticket auth and resumable event ids | Accepted |
| [0005](0005-ids-and-pagination.md) | ULIDs and opaque cursor pagination | Accepted |
| [0006](0006-frontend-stack.md) | Frontend stack | Accepted |
| [0007](0007-revise-backend-stacks.md) | Express TS monolith, four-language microservices, monolith + media service | Accepted |
| [0008](0008-minio-image.md) | Run MinIO from the frozen Bitnami legacy image | Accepted |
| [0009](0009-shared-gateway-two-modes.md) | One gateway folder at the repo root, with a host and a container mode | Accepted |
| [0010](0010-build-order-and-slim-microservices-phase-0.md) | Bring every backend to getHealth first, with a slim microservices phase 0 | Accepted |
