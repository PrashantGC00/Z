# Building the modular monolith

The plan for `backends/monolith`: one Express 5 + TypeScript app, PostgreSQL, Redis, MinIO and
BullMQ, served at `http://localhost:8081/v1` through nginx. It is built first. It teaches the
domain, finds the seams, and is reused as the core of the [hybrid](../hybrid/) build.

## Read in this order

| Doc | What it gives you |
|---|---|
| [Architecture note](../architectures/monolith.md) | *What* and *why*: shape, stack choices, how the hard flows work, trade-offs |
| [Project structure](structure.md) | Every folder and file, the layering rules, naming |
| [Data model](data-model.md) | Tables, keys, indexes and Redis keys, per module |
| [Build plan](build-plan.md) | 13 phases from an empty folder to all 59 operations LIVE, each with a definition of done |
| [Backend standards](../backend-standards.md) | The bar every operation meets: errors, auth, testing, observability, reliability |

## Ports

| Service | Port | Notes |
|---|---|---|
| nginx gateway | **8081** | The only port the frontend uses |
| API (Express, HTTP + WebSocket) | 3000 | One or more processes behind nginx |
| Worker metrics / health | 3001 | The BullMQ worker entrypoint |
| PostgreSQL | 5432 | |
| Redis | 6379 | |
| MinIO API / console | 9000 / 9001 | |
| Jaeger UI | 16686 | Traces |
| Prometheus / Grafana | 9090 / 3030 | Metrics, dashboards |

## Milestones at a glance

| Milestone | Phases | Operations LIVE | You can… |
|---|---|---|---|
| **Walking skeleton** | 0 | 1 / 59 | See "Responding" for the monolith in the app sidebar |
| **Sign in** | 1 | 8 | Register, sign in and stay signed in across token expiry |
| **Social core** | 2–4 | 31 | Follow people, post with photos, like, share, bookmark |
| **Feed** | 5 | 32 | See followed people's posts on Home, fanned out by workers |
| **Conversation** | 6–8 | 51 | Comment, get notified live, chat in real time |
| **Complete** | 9–11 | 59 | Stories, search, trending, reports |
| **Production-grade** | 12 | 59 | Load-tested, observable, hardened |

Every operation on the way follows the [definition of done](../backend-standards.md#1-definition-of-done-for-an-operation).
