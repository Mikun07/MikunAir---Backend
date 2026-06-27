# Backend Changelog

All notable changes to the MikunAir Backend API are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.0.3] — 2026-06-27

### Security

- `drizzle-orm` upgraded `^0.30.0` → `^0.45.2` — fixes GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped SQL identifiers in `sql.raw()`)
- `nodemailer` upgraded `^6.9.13` → `^9.0.1` — fixes 8 CVEs: SMTP command injection (GHSA-c7w3-x93f-qmm8, GHSA-vvjj-xcjg-gr5g), CRLF injection (GHSA-268h-hp4c-crq3), improper TLS validation (GHSA-r7g4-qg5f-qqm2), SSRF via raw message option (GHSA-p6gq-j5cr-w38f), and others
- `bcrypt` upgraded `^5.1.1` → `^6.0.0` — removes dependency on `@mapbox/node-pre-gyp` which transitively pulled in `tar <=7.5.15`; fixes 7 high-severity `node-tar` path traversal and symlink poisoning CVEs (install-time only, not runtime)
- `uuid` upgraded `^9.0.1` → `^11.1.1` — fixes GHSA-w5hq-g745-h8pq (buffer bounds check missing in v3/v5/v6 when `buf` is provided; moderate severity)
- `vitest` + `@vitest/coverage-v8` upgraded `^1.6.0` → `^4.1.9` resolves 2 critical esbuild CVEs (GHSA-67mh-4wv8-2f99) in the dev toolchain; dev dependency only, no production exposure
- `drizzle-kit` upgraded `^0.21.0` → `^0.31.10` — reduces transitive esbuild vulnerability surface via `@esbuild-kit/esm-loader`; dev CLI only, never executed in production

### Notes

- 4 moderate vulnerabilities remain in `@esbuild-kit/core-utils` (transitive of `drizzle-kit`). npm's suggested fix (`drizzle-kit@0.18.1`) would reintroduce the drizzle-orm SQL injection CVE. The esbuild CVE (dev-server cross-origin requests) has zero exposure in CI or production use of `drizzle-kit generate`/`migrate`. Accepted residual risk documented here.

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
- Booking transaction deadlock resolved: `bookingRepository.create()` was called with `this.db` (outer pool connection) inside a `db.transaction()` callback; the pool was exhausted waiting for the `FOR UPDATE` lock held by `trx`, causing a deadlock and 30 s timeout. All INSERTs (bookings, segments, passengers) are now executed via `trx.execute(sql\`...\`)` within the same transaction connection
- GraphQL `Cannot use GraphQLSchema from another module or realm` error resolved: `@graphql-tools/schema`'s `makeExecutableSchema` bundled its own copy of `graphql`, causing the schema object to belong to a different module instance than `validate()`. Replaced with `buildSchema` from the `graphql` package and `rootValue` resolver attachment — single `graphql` instance throughout
- Unit test mock for `BookingService.createBooking` updated: `trx.execute` mock now returns `{ rows: [...] }` (matching `node-postgres` `QueryResult` shape) and sequences different return values per call order to cover the seat lock, seat update, booking INSERT, and segment/passenger INSERTs

---

## [1.0.1] — 2026-06-27

### Fixed

- TypeScript type error in `src/graphql/resolvers.ts`: `Flight.origin` and `Flight.destination` are `Airport` objects resolved to `.iataCode` string before mapping to `FlightOption`
- TypeScript type error in `src/shared/logger/logger.ts`: `level` and `message` destructured as `unknown` from `Record<string, unknown>` cast to `string` to satisfy `TransformableInfo` return type

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
- Correlation ID middleware UUID injected on every request, propagated through all log entries
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
