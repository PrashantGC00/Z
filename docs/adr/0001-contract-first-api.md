# ADR-0001: Contract-first API shared by every backend

**Status:** Accepted · **Date:** 2026-10-25

## Context

Three backends with different architectures have to serve one frontend. If each one designs
its own API, the frontend needs adapters per backend, and comparing the architectures stops
being fair because each would answer different questions.

## Decision

`api/openapi.yaml` is the single source of truth, for HTTP and (in its Realtime section) the WebSocket protocol.
Backends implement them; they do not extend them privately. The frontend generates TypeScript
types from the spec (`openapi-typescript`) and calls through a typed client (`openapi-fetch`).
Every operation carries `x-status` per architecture so progress is visible in Swagger and the
frontend can gate features.

## Consequences

- The frontend switches backends with a base URL, nothing else.
- Spec changes are breaking changes for every backend marked `LIVE` on that operation.
- Backends need contract tests (e.g. Schemathesis) to earn `LIVE`.
- Architecture-specific APIs (a GraphQL layer, a service-specific upload protocol) are out of
  scope on purpose; each backend hides its internals behind the same REST surface.
