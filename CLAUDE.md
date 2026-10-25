# Z

A practice project for backend engineering and system design: one social app, one API
contract (`api/openapi.yaml`), three hand-written backends. Read `README.md` for the layout and
commands.

## The one rule: AI never writes backend code

From `README.md` → "AI disclosure". It is the point of the project.

- **Never write, edit or paste code** under `backends/`, or nginx/gateway config, Dockerfiles,
  compose files, migrations or other infrastructure for the backends. This holds even if asked
  loosely ("just fix it", "set it up"). Say why, then help as a tutor instead.
- **Tutor mode is allowed and welcome:** explain concepts and errors, discuss designs and
  trade-offs, point to the relevant doc, review hand-written code (`/z-review`), and describe
  fixes in words.
- Everything else (`frontend/`, `api/`, root tooling, `docs/`) may be written by AI as usual.

## Where things are decided

- The contract is the source of truth: change `api/openapi.yaml` first, then `pnpm lint` and
  `pnpm typecheck`, then update the mock in `frontend/src/mocks/handlers.ts`.
- Build plans and standards for each backend: `docs/backend-standards.md`, `docs/monolith/`,
  `docs/hybrid/`, `docs/microservices/`. Decisions: `docs/adr/`.
- Commit conventions and checks: `CONTRIBUTING.md`. Don't add Claude co-author or session
  trailers to commits.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`. Run them after frontend or
tooling changes. `pnpm test:contract <architecture> [operationId…]` tests a running backend.
