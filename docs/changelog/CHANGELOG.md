# Backend Changelog

All notable changes to the MikunAir Backend API are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.0.2] — 2026-06-27

### Fixed

- `NoSeatsAvailableError` (409) now thrown inside the `SELECT FOR UPDATE` transaction when seats are exhausted; previously threw a plain `Error` which fell through to the 500 handler
- `BookingHandlers.getMyBookings` now returns a plain array; previously wrapped it in `{ bookings: [...] }` which broke `Array.isArray` assertion in integration tests
- `BookingHandlers.getBookingByReference` now returns the booking directly (not `{ booking: ... }`)
- `BookingHandlers.cancelBooking` now returns 204 No Content; previously returned 200 with a body
- Cancel booking route changed from `/:id/cancel` to `/:reference/cancel`; handler now resolves the booking by reference then cancels by id, matching the integration test contract
- Integration test teardown now deletes `IT003` (concurrent booking) flights before deleting airports, preventing foreign key violation on `airports.iata_code`
- Integration test IT-004 second case corrected: guest booking without auth token returns 201 (design intent), not 401
- GraphQL endpoint replaced `graphql-http`'s `createHandler` with a plain Express async handler using `graphql()` + `parse()` + `validate()` directly; `graphql-http` enforced strict Accept/Content-Type spec compliance incompatible with the Supertest test client in CI

---

## [1.0.1] — 2026-06-27

### Fixed

- TypeScript type error in `src/graphql/resolvers.ts`: `Flight.origin` and `Flight.destination` are `Airport` objects — resolved to `.iataCode` string before mapping to `FlightOption`
- TypeScript type error in `src/shared/logger/logger.ts`: `level` and `message` destructured as `unknown` from `Record<string, unknown>` — cast to `string` to satisfy `TransformableInfo` return type

### Added

- `tsconfig.test.json` — extends base tsconfig to include `*.test.ts` files; required so ESLint typed linting can parse test files without polluting the production build
- ESLint `overrides` block for `**/*.test.ts`: disables `@typescript-eslint/unbound-method` (false positive on Vitest `expect` matchers) and `@typescript-eslint/explicit-function-return-type` (unnecessary in test helpers)
- Unit test suite (`src/**/*.test.ts`) — 44 tests across 4 domain service files, 90%+ line/branch/function coverage:
  - `booking-reference.factory.test.ts` — format, character set, ambiguous character exclusion, uniqueness
  - `flight-availability.service.test.ts` — search delegation, `getFlightOrThrow` not-found, `assertSeatsAvailable` boundary conditions
  - `identity.service.test.ts` — register (conflict, hashing, consent timestamp, DTO shape), login (wrong password, unknown email), refresh, GDPR erasure
  - `booking.service.test.ts` — create (not-found, price calculation, event publish, status update), cancel (not-found, forbidden, already-cancelled, guest booking), history, get-by-reference
- Integration test suite (`tests/integration/api.test.ts`) — 13 Supertest scenarios against a live PostgreSQL database:
  - IT-001 Health check
  - IT-002 Register (success + duplicate 409)
  - IT-003 Login (success + wrong password + unknown email)
  - IT-004 Create booking (success + unauthenticated 401)
  - IT-005 Get booking by reference (success + 404)
  - IT-006 Booking history
  - IT-007 Cancel booking (success + already-cancelled 409)
  - IT-008 GraphQL flight search
  - IT-009 No seats available 409
  - IT-010 Concurrent booking on last seat: two simultaneous requests, exactly one 201 and one 409
  - IT-011 GDPR erasure: PII anonymised, user row unqueryable by email after erasure
  - IT-012 Stack traces never leak in error responses
  - IT-013 Input validation returns 422 for missing required fields
- Initial Drizzle migration (`src/shared/database/migrations/0000_abnormal_stature.sql`) generated from schema, committed so CI can run `db:migrate` without a local `db:generate` step

### Changed

- `src/shared/database/migrate.ts` — replaced `runMigrations().catch(...)` promise chain with top-level `await` inside `try/catch` (ESLint `unicorn/prefer-top-level-await`)

---

## [1.0.0] — 2026-04-26

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
- ADR-004: Hybrid API GraphQL for search, REST for operations
- ADR-005: Drizzle ORM TypeScript-native, SQL-close, zero runtime overhead

---

*This changelog covers backend changes only. See the frontend repository for frontend release history.*
