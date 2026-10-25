# ADR-0006: Frontend stack

**Status:** Accepted · **Date:** 2026-10-25

## Decision

| Concern | Choice | Why |
|---|---|---|
| Framework | React 19 + TypeScript (strict) + Vite | Mainstream, fast dev server, no SSR needed for an app behind login |
| Package manager | pnpm workspaces | Strict dependency isolation; the TypeScript backends can join the same workspace |
| Styling | Tailwind CSS v4 with design tokens in `@theme`, `cva` + `tailwind-merge` for variants | Industry-standard utility CSS; tokens keep light/dark and per-backend colours in one place |
| Server state | TanStack Query | Caching, infinite lists, optimistic updates and retries out of the box |
| Client state | Zustand | Tiny stores for the session and typing indicators |
| API client | `openapi-typescript` + `openapi-fetch` | Types come from the contract; middleware handles auth, refresh, x-status gating and unreachable backends |
| Routing | React Router | Standard, with lazy routes for pages outside the feed |
| Mock backend | MSW | Intercepts real `fetch` calls, so the app code is identical against mock and real backends |
| Lint / format | ESLint (typescript-eslint, react-hooks) + Prettier (Tailwind class sorting) | Common defaults |
| API docs | Not in the frontend. `api/swagger.ts` (swagger-ui-express) serves the spec with `x-status` badges | Docs are browsable without the app; the spec stays the only source |

## Consequences

- Native `<dialog>` and the Popover API replace modal and menu libraries; anchor positioning
  falls back to a centred popover where unsupported.
