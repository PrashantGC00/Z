# ADR-0005: ULIDs and opaque cursor pagination

**Status:** Accepted · **Date:** 2026-10-25

## Context

Feeds, comments and messages are long, constantly growing lists. Offset pagination skips or
repeats items when rows are inserted, and becomes slow at deep offsets. IDs must be generated
without coordination in all three architectures.

## Decision

- IDs are ULIDs: 48-bit time + 80 random bits, lexicographically sortable by creation time.
- Every list uses `?cursor=<opaque>&limit=` and returns `page.nextCursor` / `page.hasMore`.
  Cursors are opaque to clients, so each backend can encode what it needs (a Postgres keyset,
  a MongoDB `_id` bound, a Redis score).

## Consequences

- Sorting by id is sorting by time, which simplifies indexes: `(author_id, id DESC)` in Postgres,
  `{ conversationId: 1, _id: -1 }` in MongoDB.
- No "jump to page 7". Acceptable for a social product.
- ULIDs leak creation time; fine for posts and messages.
