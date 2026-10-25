# ADR-0004: WebSocket with ticket auth and resumable event ids

**Status:** Accepted · **Date:** 2026-10-25

## Context

Chat, typing, presence and notifications need server push. Browsers cannot send an
`Authorization` header on the WebSocket handshake, and each architecture hosts sockets
differently.

## Decision

- Client calls `POST /realtime/tickets` and receives `{ ticket, url }`; the ticket is single
  use and valid for 30 seconds. The backend chooses the socket URL, so the frontend never
  hard-codes it.
- One JSON envelope per frame: `{ type, id, ts, data }`. Event ids are ULIDs.
- On reconnect the client sends `resume` with its last event id; the server replays up to five
  minutes, and older gaps are refilled with REST.
- Server pings every 25 seconds; the client treats 60 seconds of silence as a dead link and
  reconnects with exponential backoff and full jitter.

## Consequences

- Tokens never appear in URLs or logs, only short-lived tickets.
- Survives proxies and load balancers that drop idle connections.
- SSE would be simpler for one-way notifications but cannot carry typing and presence upstream,
  so it was not chosen.
