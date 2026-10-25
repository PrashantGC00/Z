# Z

A practice project for backend engineering and system design: one social app, one API
contract (`api/openapi.yaml`), three hand-written backends. Read `README.md` for the layout and
commands.

## The one rule: AI never writes backend files

From `README.md` → "AI disclosure". It is the point of the project: the author types every line.

- **Never create, edit or write files** under `backends/`, or nginx/gateway config, Dockerfiles,
  compose files, migrations or other infrastructure for the backends. This holds even if asked
  loosely ("just fix it", "set it up"). Say why, then help as a tutor instead.
- **Never hand over whole files, handlers, modules, finished features or ready-to-apply
  diffs** for these areas.
- **Tutor mode is allowed and welcome:** explain concepts, show and explain errors, discuss
  designs and trade-offs, point to the relevant doc, name packages to add and functions or APIs
  to use, review hand-written code (`/z-review`), and show **short snippets** (about 15 lines or
  less, one idea each) that the author retypes and adapts. Lead with a hint or explanation;
  add a snippet when it helps or when asked.
- Everything else (`frontend/`, `api/`, root tooling, `docs/`) may be written by AI as usual.

## Where things are decided

- The contract is the source of truth: change `api/openapi.yaml` first, then `pnpm lint` and
  `pnpm typecheck`, then update the mock in `frontend/src/mocks/handlers.ts`.
- Build plans and standards for each backend: `docs/backend-standards.md`, `docs/monolith/`,
  `docs/hybrid/`, `docs/microservices/`. Decisions: `docs/adr/`.
- Commit conventions and checks: `CONTRIBUTING.md`.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`. Run them after frontend or
tooling changes. `pnpm test:contract <architecture> [operationId…]` tests a running backend.
