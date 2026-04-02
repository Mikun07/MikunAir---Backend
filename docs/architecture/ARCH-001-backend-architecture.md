# Backend Architecture Document

**Service:** MikunAir Backend API  
**Version:** v1.0.0  
**Status:** Approved  
**Date:** 2026-04-26  
**Author:** Festus-Olaleye Ayomikun

---

## 1. Architecture Drivers

Ranked by importance for the backend service:

| Rank | Driver | Source Requirements |
|---|---|---|
| 1 | Security | NFR-003–005, NFR-012, NFR-007 (GDPR) |
| 2 | Reliability | NFR-002, FR-015 (atomic overbooking prevention) |
| 3 | Maintainability | NFR-010, clean module boundaries |
| 4 | Testability | NFR-010, all quality gates |
| 5 | Performance | NFR-001 (P95 search ≤ 2000ms under 100 concurrent users) |
| 6 | Scalability | NFR-009 (horizontal scaling without architectural changes) |
| 7 | Compliance | NFR-007, NFR-015 (GDPR; 7-year booking retention) |

---

## 2. Architecture Style

**Selected:** Modular Monolith with Clean Architecture layers.

| Style Evaluated | Verdict |
|---|---|
| Microservices | Rejected — distributed systems complexity without benefit for a solo project |
| Modular Monolith | **Selected** — clean domain boundaries, single deployable, full testability |
| Pure Monolith | Rejected — no domain isolation |

**Rationale:** The modular monolith delivers all the architectural discipline of microservices bounded contexts, domain isolation, dependency inversion without the operational overhead of service discovery, inter-service auth, and distributed tracing. Each module is independently testable and could be extracted to a microservice if scale required.

---

## 3. Architectural Decision Records (ADRs)

### ADR-001: Modular Monolith Backend

**Context:** Required to choose between monolith, modular monolith, and microservices for the API layer.

**Options Considered:**
1. Pure monolith — simple but no domain boundaries
2. Modular monolith — domain boundaries enforced by module structure, single deployable
3. Microservices — independent services per domain

**Decision:** Modular Monolith (Node.js/Express, TypeScript)

**Consequences:**
- ✓ Clear module boundaries demonstrable in interviews
- ✓ Single deployment unit simplifies DevOps
- ✓ Easily testable with unit and integration tests
- ✗ All modules share the same process (mitigated by strict module boundaries)

---

### ADR-002: PostgreSQL as Primary Database

**Context:** Database selection for booking and user data.

**Options Considered:**
1. PostgreSQL — relational, ACID transactions, strong typing
2. MongoDB — flexible schema, no ACID by default
3. SQLite — simple but not production-grade

**Decision:** PostgreSQL

**Consequences:**
- ✓ ACID transactions support FR-015 (atomic overbooking prevention via `SELECT FOR UPDATE`)
- ✓ Demonstrates familiarity with Postgres (listed in SAS JD)
- ✓ Supports row-level security for GDPR isolation
- ✗ Schema migrations required as domain evolves (managed with Drizzle ORM)

---

### ADR-003: JWT Authentication (Stateless)

**Context:** Authentication strategy for user sessions.

**Options Considered:**
1. JWT (stateless) — scalable, no server-side session state
2. Session cookies (stateful) — simpler revocation, requires session store
3. OAuth2 / third-party — reduces auth implementation burden

**Decision:** JWT with 15-minute access token + refresh token stored in HTTP-only cookie.

**Consequences:**
- ✓ Stateless — supports NFR-009 (horizontal scaling without sticky sessions)
- ✓ Industry standard pattern, discussable in interviews
- ✓ HTTP-only cookie for refresh token mitigates XSS risk
- ✗ Access token revocation requires blacklist (mitigated by short 15-min expiry)

---

### ADR-004: GraphQL for Flight Search, REST for Operations

**Context:** FR-019 and FR-020 require both GraphQL and REST.

**Options Considered:**
1. GraphQL only — flexible queries, single endpoint
2. REST only — simpler, well-understood
3. Hybrid — GraphQL for read-heavy flexible queries, REST for mutations

**Decision:** Hybrid. GraphQL (`/graphql`) for flight search. REST (`/api/v1`) for booking CRUD, user management, admin operations.

**Consequences:**
- ✓ Satisfies both FR-019 and FR-020
- ✓ Demonstrates both API paradigms (directly aligned with SAS JD)
- ✓ GraphQL excels at flexible, variable-shape search result queries
- ✗ Two paradigms to maintain; justified by explicit requirements

---

### ADR-005: Drizzle ORM for Database Access

**Context:** Need an ORM or query builder for PostgreSQL.

**Options Considered:**
1. Prisma — mature, excellent DX, auto-generated client
2. TypeORM — decorator-based, heavier runtime
3. Drizzle ORM — lightweight, TypeScript-native, SQL-close
4. Raw `pg` — maximum control, maximum boilerplate

**Decision:** Drizzle ORM

**Consequences:**
- ✓ Full TypeScript type safety with zero schema duplication
- ✓ SQL-level control (important for `SELECT FOR UPDATE` overbooking prevention)
- ✓ Zero runtime overhead (schema is pure TypeScript, no client generation step)
- ✗ Less mature ecosystem than Prisma; fewer community resources

---

## 4. Component Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               Node.js / Express Backend                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 API Gateway Layer                    │   │
│  │  (Helmet, CORS, rate limiting, correlation ID,       │   │
│  │   request logging, cookie parsing, auth middleware)  │   │
│  └──────────┬─────────────────────────┬─────────────────┘   │
│             │                         │                      │
│  ┌──────────▼──────────┐   ┌──────────▼──────────────────┐  │
│  │    GraphQL API      │   │        REST API              │  │
│  │  POST /graphql      │   │  /api/v1/auth                │  │
│  │  (flight search)    │   │  /api/v1/bookings            │  │
│  │                     │   │  /api/v1/passengers          │  │
│  │  graphql-http +     │   │  /api/v1/admin               │  │
│  │  depth limit (5)    │   │                              │  │
│  └──────────┬──────────┘   └──────────┬────────────────────┘  │
│             │                         │                      │
│  ┌──────────▼─────────────────────────▼──────────────────┐  │
│  │                   Domain Layer                        │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │  │
│  │  │    Flight    │ │   Booking    │ │   Identity   │  │  │
│  │  │   Service   │ │   Service    │ │   Service    │  │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │  │
│  │         │                │                │           │  │
│  │  ┌──────▼────────────────▼────────────────▼───────┐  │  │
│  │  │          In-Process Event Bus (EventEmitter)   │  │  │
│  │  │  booking.confirmed → NotificationService       │  │  │
│  │  │  booking.cancelled → NotificationService       │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────┬─────────────────────────────┘  │
│                             │                                │
│  ┌──────────────────────────▼─────────────────────────────┐  │
│  │              Data Access Layer (Repository Pattern)    │  │
│  │  IFlightRepository  IBookingRepository  IUserRepository│  │
│  │  PostgresFlightRepo PostgresBookingRepo PostgresUserRepo│  │
│  └──────────────────────────┬─────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │     PostgreSQL 16    │
                   │  (ACID, FOR UPDATE) │
                   └─────────────────────┘
```

---

## 5. Module Structure

| Module | Responsibility | Depends On |
|---|---|---|
| `flight` | Flight availability, seat inventory, schedule CRUD | `shared/database`, `shared/logger` |
| `booking` | Booking lifecycle, overbooking prevention, reference generation | `flight`, `shared/database`, `shared/events` |
| `identity` | Registration, login, JWT issuance, GDPR erasure | `shared/database`, `shared/auth`, `shared/logger` |
| `passenger` | Saved passenger profile CRUD | `shared/database` |
| `notification` | Email confirmation and cancellation (event-driven) | `shared/events`, SMTP |
| `admin` | Flight schedule management (ADMIN role only) | `flight`, `shared/auth` |
| `shared/auth` | JWT sign/verify, Express middleware, role enforcement, correlation ID | — |
| `shared/database` | Drizzle connection pool, schema, transaction helpers, migration runner | — |
| `shared/events` | In-process event bus (EventEmitter wrapper with typed events) | — |
| `shared/logger` | Winston structured JSON logger with PII sanitiser | — |
| `shared/errors` | Domain exception classes, centralised HTTP error handler | — |
| `shared/validation` | Zod schemas for all request bodies | — |

**Module boundary rule:** No module may import directly from another module's `repository/` or `domain/` directory. Communication between modules happens only via domain service interfaces or the event bus.

---

## 6. Data Architecture

### Schema (Logical)

```
User
├── id (UUID, PK)
├── email (unique, indexed)
├── password_hash
├── role (USER | ADMIN)
├── consent_given_at (timestamptz)
├── consent_withdrawn_at (timestamptz, nullable)
└── created_at

PassengerProfile
├── id (UUID, PK)
├── user_id (FK → User)
├── full_name
├── date_of_birth
├── document_type (PASSPORT | ID_CARD)
├── document_number
└── is_anonymised (boolean, default false)

Airport
├── iata_code (PK, 3-char)
├── name, city, country, timezone

Flight
├── id (UUID, PK)
├── flight_number
├── origin_iata (FK → Airport)
├── destination_iata (FK → Airport)
├── departure_at (timestamptz)
├── arrival_at (timestamptz)
├── economy_seats_total / economy_seats_available
├── business_seats_total / business_seats_available
├── economy_fare_pence (INTEGER — never float)
├── business_fare_pence (INTEGER — never float)
└── status (SCHEDULED | CANCELLED | DEPARTED)

Booking
├── id (UUID, PK)
├── reference (6-char unique alphanumeric)
├── user_id (FK → User, nullable — guests allowed)
├── status (PENDING | CONFIRMED | CANCELLED)
├── total_price_pence (INTEGER)
└── created_at / updated_at

BookingSegment
├── id (UUID, PK)
├── booking_id (FK → Booking)
├── flight_id (FK → Flight)
└── seat_class (ECONOMY | BUSINESS)

BookingPassenger
├── id (UUID, PK)
├── booking_id (FK → Booking)
├── full_name, date_of_birth, document_type, document_number
└── is_anonymised (boolean, default false)
```

### Data Consistency Strategy

| Operation | Consistency Model | Mechanism |
|---|---|---|
| Booking creation + seat decrement | Strong (serialisable) | `SELECT FOR UPDATE` within PostgreSQL transaction |
| GDPR erasure | Strong | Explicit UPDATE across all PII fields within transaction |
| Email notification | Eventual | Event emitted post-commit; NotificationService handles async |
| Booking status update | Strong | Single UPDATE within transaction |

### Money Rule

All fare and price values are stored as **integer pence** (`INTEGER` in PostgreSQL, `number` in TypeScript). Floating-point arithmetic is never used for money. Display formatting (`£125.50`) is applied only at the presentation layer.

---

## 7. Security Architecture

| Threat | Control |
|---|---|
| Password exposure | bcrypt hash (cost 12); never stored or logged in plaintext |
| JWT/XSS theft | Access token in memory only (never in localStorage); refresh token in HTTP-only, SameSite=Strict cookie |
| SQL injection | Drizzle ORM parameterised queries; no raw string interpolation in queries |
| PII in logs | Winston log sanitiser strips email, name, DOB, document fields automatically |
| Data over-exposure | Explicit DTO projections on all responses; raw DB entities never serialised |
| Admin endpoint abuse | `requireRole('ADMIN')` middleware applied before any admin handler is reached |
| GraphQL complexity attacks | `graphql-depth-limit` middleware; max query depth = 5 |
| Overbooking race condition | `SELECT FOR UPDATE` transaction serialises concurrent requests for the same seat |
| Stack traces in responses | `errorHandler` middleware strips stack traces; correlationId included for user reporting |

---

## 8. Cross-Cutting Concerns

| Concern | Implementation |
|---|---|
| Request correlation | UUID correlation ID injected at entry by `correlationIdMiddleware`; propagated in all log entries |
| Authentication | `authenticate` middleware validates JWT on every protected route |
| Authorisation | `requireRole(...roles)` middleware enforces RBAC after authentication |
| Rate limiting | `express-rate-limit`: 200 requests per 15 minutes per IP on `/api/` |
| Error handling | Centralised `errorHandler` maps domain exceptions to HTTP status codes; no stack traces exposed |
| Input validation | Zod schemas validate all request bodies; `ValidationError` thrown on failure (422) |
| Compression | `compression` middleware for all responses |
| Security headers | `helmet` middleware sets CSP, X-Frame-Options, HSTS, etc. |

---

## 9. Overbooking Prevention (FR-015)

This is the most safety-critical backend operation. The mechanism:

1. **Pre-check** (non-atomic): `FlightAvailabilityService.assertSeatsAvailable` — fast fail before acquiring DB lock
2. **Atomic lock**: `SELECT id, seats FROM flights WHERE id = $1 FOR UPDATE` — locks the row
3. **Locked check**: Re-verify seat count under the lock
4. **Decrement**: `UPDATE flights SET seats = seats - $count WHERE id = $1`
5. **Create booking**: Inside the same transaction
6. **Commit**: Both decrement and booking creation commit atomically

Two concurrent requests for the last seat will serialise at step 2. The second request will see `seats = 0` at step 3 and throw `NO_SEATS_AVAILABLE` (409).

---

## 10. Quality Attribute Analysis

| Attribute | Architectural Decision |
|---|---|
| Performance | Indexed columns on `origin_iata`, `destination_iata`, `departure_at`; Drizzle connection pooling |
| Scalability | Stateless JWT — horizontal scaling via container replication; no sticky sessions required |
| Reliability | DB transactions for booking atomicity; health check at `/health`; Docker restart policies |
| Security | JWT + HTTP-only cookies; bcrypt cost 12; Helmet CSP; no stack traces in responses |
| Maintainability | Module boundaries; Repository pattern; TypeScript throughout; strict ESLint |
| Compliance | GDPR anonymisation on erasure; consent timestamp recorded; AuditLog for booking lifecycle |
| Testability | Repository interfaces enable mock injection; domain services have zero framework dependencies |

---

## 11. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Race condition on last available seat | High | Medium | `SELECT FOR UPDATE` in DB transaction; integration test (concurrent booking) |
| JWT theft via XSS | High | Low | HTTP-only cookie for refresh token; short-lived 15-min access tokens |
| GDPR erasure incomplete | High | Low | Explicit field list in anonymisation query; integration test verifies zero PII after erasure |
| DB migration breaks running system | Medium | Medium | Drizzle ORM migrations; migrations run in CI before deployment; backwards-compatible migrations preferred |
| GraphQL complexity attacks | Medium | Low | `graphql-depth-limit` middleware; max depth = 5 |

---

## 12. Learning Concept: Clean Architecture

**What it is:** Clean Architecture (Robert C. Martin) organises code into concentric layers Entities (domain), Use Cases (application logic), Interface Adapters (controllers, repositories), Frameworks/Drivers. The Dependency Rule: source code dependencies may only point inward. The domain layer has no knowledge of Express or PostgreSQL.

**Why applied here:** The booking domain has non-trivial rules (overbooking prevention, booking lifecycle, GDPR erasure) that must be unit-testable without a running database or HTTP server.

**How it improves the backend:** `BookingService` and `FlightAvailabilityService` can be tested without mocking Express or Drizzle. The repository interface is defined in the domain; the Postgres implementation lives in the infrastructure layer.

**Interview answer:** "I applied Clean Architecture to ensure the core booking domain logic is testable in isolation. The BookingService doesn't know about Express or PostgreSQL it only depends on the IBookingRepository interface. This is the Dependency Inversion Principle at the architectural level. I can run 200 unit tests for the booking domain in under 2 seconds because none of them touch a real database."

---

*Document controlled under the MikunAir Backend documentation governance.*  
*Next review: triggered by any architectural change, new ADR, or module boundary change.*
