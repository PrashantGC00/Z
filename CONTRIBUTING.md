# Contributing

How changes get into Z: the workflow, the checks to run before every commit, and how to write
the commit. The README covers what the project is and how to run it.

## Workflow

1. Keep `main` working: it always builds, passes its checks and runs with `pnpm dev`.
2. Do each piece of work on a short-lived branch named `<type>/<short-description>`, using the
   same types as commit messages:
   `feat/monolith-auth`, `fix/upload-cancel`, `docs/adr-0008-outbox`.
3. Commit in small steps and check before each commit.
4. Before merging, review the branch. In Claude Code, `/z-review` checks it against the
   contract, the [backend standards](docs/backend-standards.md) and the build plan. For
   backend code it explains problems and may show short snippets, but it never edits backend
   files: you write the fix.
5. Merge into `main` and delete the branch.

## Before every commit

```bash
pnpm typecheck    # regenerates API types, typechecks the frontend and api/ scripts
pnpm lint         # ESLint + Redocly lint of the contract
pnpm test         # frontend unit tests
pnpm format       # Prettier (frontend)
```

A pre-commit hook (husky + lint-staged) already runs ESLint with `--fix` and Prettier on the
staged frontend files, and Redocly when `api/openapi.yaml` is staged. It is installed by
`pnpm install` once the repo is a git repository. It only sees staged files, so typecheck and
tests still need running by hand. Skip it with `git commit --no-verify` only for a work-in-progress
commit on your own branch.

CI (`.github/workflows/ci.yml`) runs the same checks, plus a production build, on every push
to `main` and every pull request.

Also run whichever of these fits the change:

| You changed | Also do |
|---|---|
| A backend operation | `pnpm test:contract <backend> <operationId>` passes against the running backend |
| `api/openapi.yaml` | Update the mock in `frontend/src/mocks/handlers.ts` and fix every call site `pnpm typecheck` flags |
| Frontend UI | Look at it in the browser, on desktop and phone widths |

Don't commit with a failing check. If something is genuinely unfinished, leave it out of the
commit or keep it on the branch.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<body: what changed and why, wrapped at 72 columns>

<footer: e.g. BREAKING CHANGE>
```

**Types**

| Type | For |
|---|---|
| `feat` | New behaviour: an operation, a feature, a service |
| `fix` | A bug fix |
| `refactor` | A code change that keeps behaviour the same |
| `perf` | A performance improvement |
| `test` | Adding or fixing tests only |
| `docs` | README, ADRs, design notes, code comments |
| `build` | Dependencies, package scripts, Docker, compose files |
| `ci` | CI configuration |
| `chore` | Anything else that isn't user-visible |

**Scopes:** `api` (the contract and its tooling), `web` (frontend), `monolith`,
`microservices` (or one service, e.g. `feed-svc`), `hybrid`, `media-svc`, `gateway`, `docs`.
Leave the scope out when a change spans the whole repo.

**The summary line**
- Imperative mood, lower case, no full stop: `add refresh token rotation`, not
  `Added refresh token rotation.`
- At most 72 characters, ideally around 50.
- Say what changes, not which files: `fix(web): stop polling after an upload is removed`.

**The body.** Explain *why*, plus anything the diff doesn't show: the trade-off chosen, what
you measured, a link to the ADR. Skip it for changes that explain themselves.

**Breaking changes** to the contract use `!` and a footer:

```
feat(api)!: return cursor pages from GET /users/{username}/followers

BREAKING CHANGE: followers is now { data, page } instead of a bare array.
```

### One logical change per commit

Each commit should build and pass on its own, and do one thing you can describe in the
summary. A few rules that follow from that:

- Keep refactors and formatting in their own commits, separate from behaviour changes.
- Commit the contract change that adds an operation before, or together with, its first
  implementation, never after it.
- Commit generated files (`frontend/src/api/schema.d.ts`, `contract.gen.ts`) together with the
  `openapi.yaml` change that produced them.

### Flipping an operation to LIVE

Change the operation's `x-status` in the same commit that finishes implementing it, after
`pnpm test:contract <backend> <operationId>` passes:

```
feat(monolith): implement createPost

Idempotency keys are stored in Postgres with a 24 h TTL, inside the
same transaction as the post insert.

x-status: createPost LIVE on monolith
```

## Changing the contract

`api/openapi.yaml` is the source of truth for all three backends, so changes to it need care:

- Prefer additive changes, such as new optional fields or new operations. A breaking change
  needs a `!` commit, and every backend that has the operation LIVE must be updated in the
  same branch.
- After editing, run `pnpm lint` and `pnpm typecheck`, then update the mock.
- Record significant decisions as an ADR in `docs/adr/`, numbered after the last one, and
  reference it in the commit body.

## AI and the backends

As the README explains, everything under `backends/`, the nginx gateway and the
infrastructure are written by hand, with no AI-generated code. AI can still explain things,
discuss designs and review code there.

Don't commit AI-generated code under `backends/` or in gateway or infrastructure files.

## Never commit

- Secrets or local config: `.env.local`, `*.local`, credentials, tokens.
- Build output and caches: `dist/`, `node_modules/`, `.schemathesis/`, `.hypothesis/`.
- Large binaries, such as media used for testing uploads. Generate them in tests instead.
