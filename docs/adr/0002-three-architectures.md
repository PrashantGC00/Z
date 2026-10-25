# ADR-0002: Build it as a modular monolith, microservices and serverless

**Status:** Superseded by [ADR-0007](0007-revise-backend-stacks.md) · **Date:** 2026-10-25

## Context

The goal is to practise system design by building the same product with architectures that
are common in industry and differ in how they handle deployment, data ownership, scaling and
consistency.

## Decision

1. **Modular monolith** (Java, Spring Boot, Spring Modulith, PostgreSQL). The default most
   companies should start with; teaches boundaries without network cost.
2. **Microservices** (Go, Kotlin, Python, Kafka, gRPC, Kubernetes). Teaches data ownership,
   eventual consistency, sagas and platform engineering.
3. **Serverless** (TypeScript on AWS Lambda, DynamoDB, EventBridge, Step Functions). Teaches
   managed-service composition, access-pattern-first data modelling and cost per request.

Event-driven design is used inside all three (outbox, domain events) rather than being a fourth
architecture.

## Consequences

- Build order: monolith → microservices → serverless, so each later build can reuse the
  boundaries and lessons of the earlier ones.
- Four languages across the project; acceptable for practice, not a recommendation for a team.
- Each backend runs on its own port (8081–8083) so they can run side by side for comparisons.
