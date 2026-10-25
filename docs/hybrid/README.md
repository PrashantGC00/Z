# Building the monolith + media service

The plan for `backends/hybrid`: the [modular monolith](../monolith/) as the core, with file
uploads and compression moved into a separate media service. It is served at
`http://localhost:8083/v1`. It is built last, and practises the most common real-world
refactor: extracting one bursty, CPU-heavy capability from a working monolith.

## Prerequisites

- The monolith through **phase 4** (media pipeline), with the media module behind its
  `MediaStorage` / `MediaProcessor` ports. Ideally the monolith is complete, so the hybrid
  inherits every other operation for free.
- The outbox and BullMQ infrastructure from monolith phase 5.

## Read in this order

| Doc | What it gives you |
|---|---|
| [Architecture note](../architectures/hybrid.md) | *What* and *why*: the seam, the flows, failure modes, trade-offs |
| [Project structure](structure.md) | How the core reuses the monolith, the media service's layout, the compose stack |
| [Protocol](protocol.md) | The upload token, the two queues and their message schemas: the contract between the processes |
| [Build plan](build-plan.md) | 8 phases from an empty folder to a measured, failure-tested extraction |
| [Backend standards](../backend-standards.md) | The bar every operation meets |

## Ports

The hybrid stack runs alongside the monolith's, so its host ports are offset.

| Service | Port | Notes |
|---|---|---|
| nginx gateway | **8083** | `/v1/*` → core, `/upload/*` → media receiver, `/files/*` → MinIO variants |
| Core API (the monolith image, `MEDIA_ADAPTER=remote`) | 3100 | |
| Media receiver | 3200 | Upload endpoint, streaming to MinIO |
| Media workers | 3201 | Metrics and health only |
| PostgreSQL | 5433 | The core's own database, separate from the monolith's |
| Redis | 6380 | Shared by core and media service (queues) |
| MinIO API / console | 9002 / 9003 | |
| Jaeger UI | 16687 | One trace across both processes |

## Milestones at a glance

| Milestone | Phases | You can… |
|---|---|---|
| **Core running** | 0 | Use the whole app on :8083, with media still processed in-process |
| **Uploads through the service** | 1–3 | Upload a photo whose bytes never touch the core |
| **Processing extracted** | 4–5 | Watch workers in another process produce variants, and the core learn they're ready |
| **Production-grade** | 6–7 | Show the split pays off under load, and survives each process dying |
