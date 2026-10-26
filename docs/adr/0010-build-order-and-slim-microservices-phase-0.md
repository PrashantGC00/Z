# ADR-0010: Bring every backend to getHealth first, with a slim microservices phase 0

**Status:** Accepted · **Date:** 2026-10-26

## Context

The monolith's walking skeleton (phase 0, `getHealth`) is done. The README suggested building
the monolith completely, then the microservices, then the hybrid. Instead, the author wants all
three backends answering `getHealth` before going deeper, so the gateway, the compose stacks
and the frontend's backend switcher are exercised for every architecture early.

Two of the docs were in the way:

- **Microservices phase 0** builds the whole platform up front: Redpanda, a MongoDB replica set,
  Postgres with a role per service, an OTel Collector, Prometheus, Grafana, `buf` generation for
  four languages, a gateway route checker and a CI matrix. Most of it would sit unused until
  phases 2 to 6.
- The hybrid and microservices docs put each gateway inside its backend
  (`backends/hybrid/nginx/`, `backends/microservices/deploy/nginx/`). [ADR-0009](0009-shared-gateway-two-modes.md)
  later decided on one gateway folder at the repo root.

## Decision

**Build order.**

1. Hybrid phase 0: the monolith image on its own stack, reporting `architecture: "hybrid"`.
2. Microservices phase 0, slimmed down as below.
3. Monolith phase 1 onwards. After that, build in milestones (for example monolith phases 1 to 3,
   then microservices phases 1 to 3, cut along the seams the monolith revealed), not one
   operation at a time across all three.

**Slim microservices phase 0.** Build only what `getHealth` needs: the identity-svc skeleton,
its Postgres, Jaeger, the `:8082` gateway server and a CI job for identity-svc. Each other
piece of the platform arrives in the phase that first uses it:

| Piece | Added in |
|---|---|
| Redis, Redpanda + `redpanda-init` (first outbox relay, auth rate limits) | 1 |
| `proto/` with `buf`, the route-check script, the CI matrix | 2 (first gRPC call, second service) |
| MinIO | 4 |
| MongoDB replica set | 6 |
| OTel Collector, Prometheus, Grafana | 12, or earlier when a phase wants metrics |

**Aggregated health.** identity-svc owns `getHealth`. It reports its own Postgres and the
`/readyz` of every service in a configured list (for example `HEALTH_SERVICES`), in
`Health.dependencies`. The rules:

- call `/readyz`, never another service's `/v1/health`, so aggregators can't call each other;
- run the calls in parallel, each with a short timeout (about 1 s);
- cache the result for a few seconds, because `/v1/health` is public and each request
  would otherwise fan out to every service;
- always answer `200`: a failing dependency is `"down"` and the overall `status` is
  `degraded`.

**Gateways.** The `:8082` and `:8083` gateways are more `server` blocks and upstream variables
in the root `nginx/`, as ADR-0009 says. The hybrid and microservices docs are updated to match.

## Consequences

- All three backends show as **Responding** in the app early, and each later phase starts from
  a running stack.
- Microservices phase 0 takes days, not weeks, and the author meets each platform piece when a
  feature needs it. The cost is that later phases each carry a little infrastructure work.
- Once the list of services grows, the aggregator can move out of identity-svc into a small
  service of its own. That is a good exercise for phase 12.
- The hybrid can't go beyond phase 0 until monolith phase 4 (media). It picks up every other
  monolith operation as the monolith gains it.
