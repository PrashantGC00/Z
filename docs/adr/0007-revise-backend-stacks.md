# ADR-0007: Revise backend stacks; third architecture is monolith + media service

**Status:** Accepted · **Date:** 2026-10-25 · **Supersedes:** [ADR-0002](0002-three-architectures.md)

## Context

The original plan (ADR-0002) used Java/Spring, Go/Kotlin/Python and AWS serverless. The goals
changed: practise **Express + TypeScript, Go (Fiber), Rust and Python (FastAPI)** with
**PostgreSQL and MongoDB**, with no AWS account. Serverless was dropped, and so was a
short-lived event sourcing + CQRS replacement.

## Decision

| Architecture | Shape | Port |
|---|---|---|
| Modular monolith | One Express 5 + TypeScript app | 8081 |
| Microservices | Services in Express TS, Go Fiber, Rust and FastAPI; PostgreSQL + MongoDB | 8082 |
| Monolith + media service | The monolith, with file uploads and compression in a separate service | 8083 |

The id of the third architecture is `hybrid` in `x-status` and `x-architectures`.

Backend code, the gateway and their detailed designs are written by hand as practice; this repo
provides the contract, the Swagger server and the frontend.

The API docs live outside the frontend: `api/swagger.ts` (swagger-ui-express), a dev-only server
that Node runs directly; nothing is built for it.

## Consequences

- The hybrid architecture reuses the monolith and practises extracting one capability into a
  service.
- Everything runs locally; no cloud account is needed.
