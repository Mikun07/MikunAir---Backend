# Backend Changelog

All notable changes to the MikunAir Backend API are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.0.0] — 2026-06-26

### Added

- Node.js/Express/TypeScript backend with ESM (`"type": "module"`, NodeNext resolution)
- Modular monolith structure: `flight`, `booking`, `identity`, `passenger`, `notification`, `admin` modules
- Clean Architecture layers: domain services → repository interfaces → Postgres implementations
- **GraphQL API** (`POST /graphql`) for flight search using `graphql-http` + `@graphql-tools/schema`
  - `searchFlights` query with outbound/inbound results
  - Query depth limiting (max 5) via `graphql-depth-limit`
- **REST API** (`/api/v1`) for all mutation and management operations
  - `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
  - `POST /users/me/erasure` (GDPR right to erasure)
  - `POST/GET /bookings`, `GET /bookings/:reference`, `POST /bookings/:id/cancel`
  - `GET/POST/DELETE /passengers`
  - `GET/POST/PATCH/DELETE /admin/flights`
  - `GET /health`
- JWT authentication: 15-minute access token + HTTP-only refresh token cookie
- Role-based access control: `USER` and `ADMIN` roles enforced via `requireRole` middleware
- Overbooking prevention via `SELECT FOR UPDATE` PostgreSQL transaction (FR-015)
- In-process typed event bus (`EventEmitter` wrapper) for `booking.confirmed` and `booking.cancelled` events
- Email notification service (`NotificationService`) via Nodemailer
- Winston structured JSON logging with PII sanitiser (name, email, DOB, document fields redacted)
- Correlation ID middleware — UUID injected on every request, propagated through all log entries
- Drizzle ORM schema: `users`, `flights`, `airports`, `bookings`, `booking_segments`, `booking_passengers`, `passenger_profiles`
- Zod validation schemas for all request bodies
- Domain exception classes: `FlightNotFoundError`, `BookingNotFoundError`, `NoSeatsAvailableError`, `BookingAlreadyCancelledError`, `UnauthorisedError`, `ForbiddenError`, `InvalidCredentialsError`, `ConflictError`, `ValidationError`
- Centralised error handler mapping domain exceptions to HTTP status codes (no stack traces in responses)
- Multi-stage Dockerfile: `development` (tsx watch), `production` (non-root user, prod deps only)
- GitHub Actions CI pipeline (`.github/workflows/ci.yml`): typecheck → lint → unit tests + coverage → migrations → integration tests → security audit → schema validation → Docker build
- `backend/tests/integration/` — Supertest integration test suite (13 scenarios)
- `backend/tests/performance/` — k6 load test scripts
- `drizzle.config.ts`, `vitest.config.ts`, `vitest.integration.config.ts`
- `scripts/validate-schema.ts` — validates Drizzle schema exports at CI time
- `.env.example` — all required environment variables documented with safe defaults

### Technical Decisions (see `docs/adr/` for full ADRs)

- ADR-001: Modular Monolith selected over microservices
- ADR-002: PostgreSQL selected for ACID transaction support (overbooking prevention)
- ADR-003: Stateless JWT (15-min access + HTTP-only refresh cookie)
- ADR-004: Hybrid API — GraphQL for search, REST for operations
- ADR-005: Drizzle ORM — TypeScript-native, SQL-close, zero runtime overhead

---

*This changelog covers backend changes only. See the frontend repository for frontend release history.*
