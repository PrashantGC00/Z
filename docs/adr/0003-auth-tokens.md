# ADR-0003: JWT access tokens with rotating refresh tokens

**Status:** Accepted · **Date:** 2026-10-25

## Context

All three backends must accept the same credentials flow, and the gateway in front of them
must be able to validate requests without calling a database.

## Decision

- Access token: JWT, 15 minutes, `Authorization: Bearer`. Validated statelessly.
- Refresh token: opaque, single use, rotated on every `POST /auth/refresh`. Tokens belong to a
  family; presenting an already-used token revokes the family (reuse detection).
- Tokens are returned in the response body and stored by the frontend per backend.

## Consequences

- Short-lived access tokens bound the damage of a leak; revocation takes up to 15 minutes.
- Storing tokens in JS-accessible storage is weaker against XSS than an `httpOnly` cookie. It is
  accepted here because the frontend talks to several origins; a production build should move
  the refresh token to an `httpOnly`, `SameSite=Strict` cookie on a single API origin.
- The frontend refreshes on `401` with a single in-flight refresh shared by concurrent requests.
