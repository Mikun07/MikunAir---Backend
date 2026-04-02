# Backend Software Design Document

**Service:** MikunAir Backend API  
**Version:** v1.0.0  
**Status:** Approved  
**Date:** 2026-04-26  
**Author:** Festus-Olaleye Ayomikun  
**Depends On:** ARCH-001-backend-architecture.md

---

## 1. Module Catalog

| Module | Responsibility | Key Files |
|---|---|---|
| `flight` | Flight availability, seat inventory, schedule management | `flight-availability.service.ts`, `postgres-flight.repository.ts` |
| `booking` | Booking lifecycle, overbooking prevention, reference generation | `booking.service.ts`, `booking-reference.factory.ts`, `postgres-booking.repository.ts` |
| `identity` | Registration, login, JWT issuance, password hashing, GDPR erasure | `identity.service.ts`, `postgres-user.repository.ts`, `auth.handlers.ts` |
| `passenger` | Saved passenger profile CRUD | `postgres-passenger.repository.ts`, `passenger.handlers.ts` |
| `notification` | Email confirmation and cancellation dispatch (event-driven) | `notification.service.ts` |
| `admin` | Flight schedule CRUD (ADMIN role only) | `admin.handlers.ts`, `admin.router.ts` |
| `shared/auth` | JWT sign/verify, Express middleware, correlation ID | `jwt.ts`, `middleware.ts`, `correlation.ts` |
| `shared/database` | Drizzle connection, schema, transaction helpers, migrations | `schema.ts`, `connection.ts`, `migrate.ts` |
| `shared/events` | In-process typed event bus (EventEmitter wrapper) | `event-bus.ts` |
| `shared/logger` | Winston structured JSON logger with PII sanitiser | `logger.ts`, `sanitiser.ts` |
| `shared/errors` | Domain exception classes and centralised error handler | `domain-errors.ts`, `error-handler.ts` |
| `shared/validation` | Zod schemas for request body validation | `schemas.ts` |

---

## 2. Repository Interface Specifications

### IFlightRepository

```typescript
interface IFlightRepository {
  findAvailable(params: FlightSearchParams): Promise<Flight[]>;
  findById(id: string): Promise<Flight | null>;
  create(flight: CreateFlightDTO): Promise<Flight>;
  update(id: string, dto: UpdateFlightDTO): Promise<Flight>;
  deactivate(id: string): Promise<void>;
  list(): Promise<Flight[]>;
}
```

### IBookingRepository

```typescript
interface IBookingRepository {
  create(booking: CreateBookingInternalDTO): Promise<Booking>;
  findById(id: string): Promise<Booking | null>;
  findByReference(reference: string): Promise<Booking | null>;
  findByUserId(userId: string): Promise<Booking[]>;
  updateStatus(id: string, status: BookingStatus): Promise<void>;
}
```

### IUserRepository

```typescript
interface IUserRepository {
  create(user: CreateUserDTO): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  anonymise(userId: string): Promise<void>;
}
```

---

## 3. Domain Service Design

### BookingService

**Constructor injection:** `IBookingRepository`, `IFlightRepository`, `Db`, `EventBus`

**`createBooking(dto)`**
1. Pre-check: `FlightAvailabilityService.assertSeatsAvailable` (fast fail)
2. Calculate `totalPricePence` (integer arithmetic only — no floats)
3. Generate booking reference (`BookingReferenceFactory`)
4. Open DB transaction → `SELECT FOR UPDATE` on flight rows → verify seats under lock → decrement → create booking record → commit
5. Update booking status to `CONFIRMED` post-transaction
6. Publish `booking.confirmed` event

**`cancelBooking(bookingId, requestingUserId)`**
1. Load booking — throw `BookingNotFoundError` if absent
2. Assert `booking.userId === requestingUserId` — throw `ForbiddenError` if mismatch
3. Assert `booking.status !== 'CANCELLED'` — throw `BookingAlreadyCancelledError` if already cancelled
4. Update status to `CANCELLED`
5. Publish `booking.cancelled` event

### IdentityService

**`register(email, password, _consentGiven)`**
1. Check for existing user by email — throw `ConflictError` if found
2. `bcrypt.hash(password, 12)`
3. Create user with `consentGivenAt: new Date()`
4. Build and return `AuthTokens` (access token + refresh token)

**`requestErasure(userId)`**
1. Load user — throw if not found
2. Call `userRepository.anonymise(userId)` — nullifies all PII fields in transaction

### FlightAvailabilityService

**`assertSeatsAvailable(flight, seatClass, passengerCount)`** — throws `NoSeatsAvailableError` if available seats < requested count. Pure function; no DB access. Called before acquiring the `SELECT FOR UPDATE` lock.

---

## 4. REST API Design

Base path: `/api/v1`

### Identity

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Create account; returns `AuthTokens` |
| `POST` | `/auth/login` | None | Login; returns `AuthTokens` |
| `POST` | `/auth/refresh` | HTTP-only cookie | Exchange refresh token for new access token |
| `POST` | `/auth/logout` | Bearer | Clear refresh token cookie |
| `POST` | `/users/me/erasure` | Bearer | GDPR erasure — anonymise all PII |

### Bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/bookings` | Optional Bearer | Create booking (guests allowed) |
| `GET` | `/bookings` | Bearer | List authenticated user's bookings |
| `GET` | `/bookings/:reference` | Optional Bearer | Get booking by reference |
| `POST` | `/bookings/:id/cancel` | Bearer | Cancel a booking |

### Passengers

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/passengers` | Bearer | List saved passenger profiles |
| `POST` | `/passengers` | Bearer | Create or update a passenger profile |
| `DELETE` | `/passengers/:id` | Bearer | Delete a passenger profile |

### Admin

All admin routes require `Bearer` token with `ADMIN` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/flights` | ADMIN | List all flights |
| `POST` | `/admin/flights` | ADMIN | Create a flight |
| `PATCH` | `/admin/flights/:id` | ADMIN | Update flight details |
| `DELETE` | `/admin/flights/:id` | ADMIN | Deactivate a flight |

### System

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Returns `{ status: "ok", service: "mikunair-backend" }` |

---

## 5. GraphQL API Design

Endpoint: `POST /graphql`  
Max query depth: 5 (enforced by `graphql-depth-limit`)

```graphql
type Query {
  searchFlights(
    origin: String!
    destination: String!
    departureDate: String!
    passengers: Int!
    returnDate: String
    seatClass: SeatClass
  ): FlightSearchResult!
}

type FlightSearchResult {
  outbound: [FlightOption!]!
  inbound: [FlightOption!]
}

type FlightOption {
  id: ID!
  flightNumber: String!
  origin: Airport!
  destination: Airport!
  departureAt: String!
  arrivalAt: String!
  durationMinutes: Int!
  stops: Int!
  availableSeats: Int!
  farePerPassenger: FareBreakdown!
}

type FareBreakdown {
  baseFarePence: Int!
  taxesPence: Int!
  totalPence: Int!
  currency: String!
}

type Airport {
  iataCode: String!
  name: String!
  city: String!
  country: String!
}

enum SeatClass {
  ECONOMY
  BUSINESS
}
```

---

## 6. Domain Model

### Entities

**Flight**
- State: `SCHEDULED | CANCELLED | DEPARTED`
- Invariant: seat counts are never negative
- Behaviour: `isAvailable(seatClass, count)` — false if available seats < count

**Booking**
- State lifecycle: `PENDING → CONFIRMED → CANCELLED`
- Invariant: must have at least one `BookingSegment` and one `BookingPassenger`
- Behaviour: cancellation only from PENDING or CONFIRMED

**User**
- Invariant: email unique, `password_hash` never null
- Behaviour: `anonymise()` — nullifies all PII fields, sets `consent_withdrawn_at`

### Value Objects

| Value Object | Format | Validation |
|---|---|---|
| `BookingReference` | 6-character alphanumeric | `/^[A-Z0-9]{6}$/` |
| `IataCode` | 3-character uppercase | `/^[A-Z]{3}$/` |
| `MoneyAmount` | Integer pence, ≥ 0 | Never negative, never float |
| `SeatClass` | Enum | `ECONOMY` \| `BUSINESS` |
| `BookingStatus` | Enum | `PENDING` \| `CONFIRMED` \| `CANCELLED` |

### Business Rules (enforced in domain services only — never in handlers or repositories)

1. Booking cannot be created if `flight.availableSeats(seatClass) < passengerCount` — enforced atomically via `SELECT FOR UPDATE`
2. A `CANCELLED` booking cannot be cancelled again — `BookingAlreadyCancelledError` thrown
3. GDPR erasure anonymises all PII but does **not** delete the Booking record (7-year retention: NFR-015)
4. All fare prices are stored and calculated in integer pence — no floating-point arithmetic on money

---

## 7. Design Patterns Applied

| Pattern | Applied Where | Justification |
|---|---|---|
| Repository | All data access (`postgres-*.repository.ts`) | Decouples domain from persistence; enables mock injection for unit tests |
| Factory | `BookingReferenceFactory` | Encapsulates unique 6-char reference generation; keeps `BookingService` constructor clean |
| Observer / Event Bus | `booking.confirmed → NotificationService` | Decouples notification delivery from booking creation |
| Dependency Injection | All domain services | Constructor injection; no service locators; enables unit test mock injection |
| Middleware Chain | Express request pipeline (`app.ts`) | Auth, logging, validation, error handling as composable, independently testable middleware |
| DTO Projection | All API responses | Never serialise raw DB entities; explicit shape control prevents accidental PII leakage |

---

## 8. Error Handling Design

| Situation | Domain Exception | HTTP Status | Client-Facing Message |
|---|---|---|---|
| Flight not found | `FlightNotFoundError` | 404 | "Flight not found." |
| No seats available | `NoSeatsAvailableError` | 409 | "No seats available for this flight." |
| Booking not found | `BookingNotFoundError` | 404 | "Booking not found." |
| Booking already cancelled | `BookingAlreadyCancelledError` | 409 | "This booking is already cancelled." |
| Unauthenticated | `UnauthorisedError` | 401 | "Authentication required." |
| Insufficient role | `ForbiddenError` | 403 | "You do not have permission to perform this action." |
| Invalid credentials | `InvalidCredentialsError` | 401 | "Invalid email or password." |
| Email already registered | `ConflictError` | 409 | "An account with this email address already exists." |
| Request body invalid | `ValidationError` (Zod) | 422 | Field-specific validation messages |
| Unexpected error | `InternalError` | 500 | "An unexpected error occurred. Reference: {correlationId}" |

**Rules:**
- Stack traces are **never** exposed in API responses (NFR-012)
- All errors are logged server-side with the full stack trace and correlation ID
- `500` responses include the correlation ID for user-reported incident investigation

---

## 9. Security Design

| Risk | Mitigation |
|---|---|
| Password exposure | bcrypt hash (cost 12); never stored or logged in plaintext |
| XSS / JWT theft | Access token in memory only; refresh token in HTTP-only, SameSite=Strict cookie |
| SQL injection | Drizzle ORM parameterised queries exclusively; no raw string interpolation |
| PII in logs | `sanitiser.ts` strips name, DOB, document fields before any Winston log output |
| Data over-exposure | DTO projections on all responses; raw Drizzle entities never passed to `res.json()` |
| Admin endpoint abuse | `requireRole('ADMIN')` middleware enforced before domain services are reached |
| GraphQL depth attacks | `graphql-depth-limit` middleware at schema level; max depth = 5 |

---

## 10. Design Decision Records (DDRs)

### DDR-001: Zod for Input Validation

**Context:** Need a validation library for request bodies and query parameters.

**Options:** Joi, Yup, Zod

**Decision:** Zod — TypeScript-first, schema types inferred directly into domain DTOs, zero manual type duplication.

**Consequences:** ✓ Type-safe validation. ✓ Schema and type defined once. ✗ Slightly verbose for deeply nested schemas.

---

### DDR-002: Integer Pence for Money Values

**Context:** Fare prices must be stored and calculated without floating-point rounding errors.

**Options:** Float (e.g. `125.50`), Decimal string, Integer pence (`12550`)

**Decision:** Integer pence. `£125.50` → stored as `12550`. Division for display only (`pence / 100`), never for calculation.

**Consequences:** ✓ No rounding errors ever. ✓ Safe integer arithmetic. ✗ Requires formatting function at display layer.

---

### DDR-003: EventEmitter Event Bus (In-Process)

**Context:** NotificationService must be decoupled from BookingService but they run in the same process.

**Options:** Redis pub/sub, RabbitMQ, in-process EventEmitter

**Decision:** In-process typed EventEmitter wrapper. No message broker needed for a single-process deployment.

**Consequences:** ✓ Zero infrastructure overhead. ✓ Simple to test. ✗ Events lost on process crash (acceptable; notifications are best-effort in v1.0.0).

---

## 11. Testability Assessment

| Area | Approach |
|---|---|
| Domain services | Constructor-injected interfaces — unit tests inject mock repositories; no framework dependencies |
| Repositories | Integration tests with real PostgreSQL test database |
| HTTP handlers | Supertest integration tests against full Express app |
| GraphQL resolvers | Supertest integration tests via `/graphql` endpoint |
| Concurrent booking | Parallel Supertest requests in integration test (FR-015 validation) |
| Middleware | Unit-testable in isolation (pure functions with `req`, `res`, `next`) |

---

*Document controlled under the MikunAir Backend documentation governance.*  
*Next review: triggered by any module boundary change, new API endpoint, or domain rule change.*
