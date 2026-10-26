# ADR-0009: One gateway folder at the repo root, with a host and a container mode

**Status:** Accepted · **Date:** 2026-10-26

## Context

The monolith build plan put the gateway inside the backend (`backends/monolith/nginx/nginx.conf`)
and expected `pnpm compose && pnpm dev`: dependencies in Docker, the API on the host with hot
reload. Phase 0 also adds a Dockerfile and a CI image build, so the API can run in a container
too. nginx then needs a different upstream for each case:

| Mode | API runs | nginx upstream |
|---|---|---|
| Dev | On the host (`pnpm dev`, hot reload) | `host.docker.internal:3000` |
| Full | In the `app` container (compose profile `full`) | `z-monolith:3000` on the `z_edge` network |

A hard-coded upstream breaks one of the two modes: nginx resolves upstream names at startup,
so `z-monolith` with no container fails with `host not found in upstream`, and the host
address never reaches the container.

## Decision

- The gateway lives at the repo root in `nginx/`, with its own compose project (`z_nginx`), so
  it can sit in front of any backend and be started and stopped separately.
- The config is a template, `nginx/default.conf.template`. The official nginx image runs
  envsubst on `/etc/nginx/templates/*.template` at start, filling `${MONOLITH_UPSTREAM}` and
  leaving nginx's own `$variables` untouched.
- Gateway and app share an external Docker network, `z_edge`. The app joins it with the alias
  `z-monolith`.
- `nginx/Makefile` chooses the mode: `make up` (host upstream, the default) and `make full`
  (container upstream). Both create `z_edge` if it is missing. The root scripts wrap them:
  `pnpm compose` / `pnpm down` and `pnpm compose:full` / `pnpm down:full`.

The Makefile departs from [backend standards §10](../backend-standards.md#10-local-development-and-delivery),
which keeps a TypeScript backend's tasks in `package.json`. The gateway is not a TypeScript
package and has no `package.json`; a Makefile with one target per mode is the smallest thing
that sets the variable and the network.

## Consequences

- Adding the microservices (`:8082`) or hybrid (`:8083`) gateway means another upstream
  variable and `server` block in the same folder, not a new gateway.
- In dev mode the container reaches the host, so a host firewall must allow the Docker bridge
  to reach port 3000. On Linux with UFW, a missing rule shows up as `504` from nginx.
- In full mode nginx keeps the container's IP from startup. Recreating the `app` container
  without restarting nginx gives `502` until nginx re-resolves; the fix is `resolver
  127.0.0.11` with `server … resolve` in a shared `zone`.
