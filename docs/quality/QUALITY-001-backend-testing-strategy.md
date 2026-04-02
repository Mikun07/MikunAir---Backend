# Backend Quality Engineering & Testing Strategy

**Service:** MikunAir Backend API  
**Version:** v1.0.0  
**Status:** Approved  
**Date:** 2026-04-26  
**Author:** Festus-Olaleye Ayomikun  
**Depends On:** DESIGN-001-backend-design.md

---

## 1. Quality Attribute Priorities

| Rank | Attribute | Source |
|---|---|---|
| 1 | Reliability | NFR-002, FR-015 (no overbooking, ever) |
| 2 | Security | NFR-003–005, NFR-012 |
| 3 | Correctness | All functional requirements |
| 4 | Performance | NFR-001 (P95 search ≤ 2000ms under 100 concurrent users) |
| 5 | Compliance (GDPR) | NFR-007, NFR-015 |
| 6 | Maintainability | NFR-010 (80% unit test coverage on business logic) |

---

## 2. Risk Assessment

### Business Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Overbooking — two users book the last seat simultaneously | Critical | `SELECT FOR UPDATE` transaction; concurrent booking integration test (mandatory — must always pass) |
| GDPR erasure incomplete — PII fields not anonymised | High | Explicit field list in anonymise query; integration test asserts zero PII fields remain post-erasure |
| Confirmation email not sent | Medium | Event-driven notification; integration test verifying email dispatch call |

### Technical Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Race condition on seat decrement | Critical | Integration test: two simultaneous `POST /bookings` requests on a flight with 1 seat remaining |
| JWT validation bypass | High | Integration tests for every protected endpoint without token, with expired token, with invalid signature |
| Missing DB index — slow search under load | Medium | DB index on `origin_iata`, `destination_iata`, `departure_at`; verified via performance test |
| Validation bypassed via direct API call | Medium | Zod validation at handler level; unit tests for all schemas |

### Security Risks

| Risk | Impact | Mitigation |
|---|---|---|
| SQL injection via search params | High | Drizzle ORM parameterised queries; integration test with injection strings |
| Unauthenticated access to protected endpoints | High | Integration test: all protected routes return 401 without valid JWT |
| USER role accessing ADMIN endpoints | High | Integration test: `POST /admin/flights` with USER role returns 403 |

---

## 3. Testing Pyramid

```
         ┌────────────────────────┐
         │  Integration (40%)     │  ← Supertest + real PostgreSQL
         ├────────────────────────┤
         │     Unit (60%)         │  ← Vitest: domain services, value objects, middleware
         └────────────────────────┘
```

E2E tests (Playwright) cover full user journeys including the frontend and belong to the frontend repo.

---

## 4. Unit Testing Plan

**Framework:** Vitest (TypeScript-native)  
**Location:** Alongside source files (`*.test.ts`)  
**Command:** `npm test` / `npm run test:coverage`

### Components to Unit Test

| Component | What to Test | Mocking Strategy |
|---|---|---|
| `BookingService.createBooking` | Overbooking prevention, reference generation, event emission, price calculation | Mock `IBookingRepository`, `IFlightRepository`, `EventBus` |
| `BookingService.cancelBooking` | Status transition validation, ownership check | Mock `IBookingRepository` |
| `IdentityService.register` | Password hashing, duplicate detection, consent recording, token generation | Mock `IUserRepository` |
| `IdentityService.login` | Credential validation, JWT issuance, invalid password rejection | Mock `IUserRepository` |
| `IdentityService.requestErasure` | Anonymisation called for correct user | Mock `IUserRepository` |
| `FlightAvailabilityService.assertSeatsAvailable` | Seat count logic, class selection, edge cases (0 seats) | Mock `IFlightRepository` |
| `BookingReferenceFactory` | Format validation (`/^[A-Z0-9]{6}$/`), uniqueness across N calls | No mocks — pure function |
| Zod validation schemas | All valid inputs pass; all invalid inputs rejected with correct field messages | No mocks |
| `authenticate` middleware | Valid JWT passes; expired JWT rejected; missing header rejected | No mocks pure function |
| `requireRole` middleware | Correct role passes; wrong role returns 403 | No mocks |
| Log sanitiser | PII fields (email, name, DOB, document) are redacted in output | No mocks |

**Coverage Target:** ≥ 80% on all business logic modules (NFR-010).  
CI fails if coverage drops below threshold.

**Test Naming Convention:** `should [do X] when [condition Y]`  
**Rule:** Test behaviour, not implementation. One logical assertion per test.

---

## 5. Integration Testing Plan

**Framework:** Supertest + real PostgreSQL  
**Config:** `vitest.integration.config.ts`  
**Command:** `npm run test:integration`  
**Location:** `tests/integration/`  
**Database:** Isolated `flight_booking_test` DB; reset via migration rollback before each suite.

### Test Scenarios

| ID | Scenario | Endpoint | Assertion |
|---|---|---|---|
| IT-001 | Flight search returns results | `POST /graphql` (searchFlights) | 200, `outbound` array non-empty |
| IT-002 | Flight search no matching flights | `POST /graphql` (no matching date) | 200, empty `outbound` array |
| IT-003 | Guest booking creation | `POST /api/v1/bookings` | 201, booking reference in response |
| **IT-004** | **Concurrent booking only one succeeds** | **Two simultaneous `POST /api/v1/bookings` on flight with 1 seat** | **Exactly one 201, one 409 — overbooking never occurs** |
| IT-005 | User registration | `POST /api/v1/auth/register` | 201, `accessToken` in response |
| IT-006 | Login with valid credentials | `POST /api/v1/auth/login` | 200, `accessToken` returned |
| IT-007 | Login with invalid credentials | `POST /api/v1/auth/login` (wrong password) | 401 |
| IT-008 | Access protected endpoint without token | `GET /api/v1/bookings` (no header) | 401 |
| IT-009 | Access admin endpoint as USER role | `POST /api/v1/admin/flights` (USER JWT) | 403 |
| IT-010 | Cancel a confirmed booking | `POST /api/v1/bookings/:id/cancel` | 200, status = `CANCELLED` |
| IT-011 | Cancel an already-cancelled booking | `POST /api/v1/bookings/:id/cancel` twice | Second call returns 409 |
| IT-012 | GDPR erasure anonymises PII | `POST /api/v1/users/me/erasure` | All PII fields contain `[REDACTED]` on subsequent lookup |
| IT-013 | SQL injection in search params | `searchFlights(origin: "'; DROP TABLE flights; --")` | 422 or empty results; `flights` table intact |

**IT-004 is mandatory and must always pass.** This is the concurrent booking race condition test (FR-015).

---

## 6. Security Testing Plan

| Test | Method | Assertion |
|---|---|---|
| Missing JWT | Call every protected endpoint without Authorization header | All return 401 |
| Expired JWT | Send JWT with `exp` in the past | Returns 401 |
| Invalid JWT signature | Tamper with JWT payload (modify claims, re-encode) | Returns 401 |
| Wrong role | USER calls `POST /api/v1/admin/flights` | Returns 403 |
| SQL injection | Pass `"'; DROP TABLE flights; --"` in GraphQL origin param | Returns 422 or empty result; no DB error |
| GraphQL depth attack | Send query nested 6+ levels | Returns 400 (`depth limit exceeded`) |
| Rate limit | Send 201 requests in 15 minutes to `/api/` | 201st request returns 429 |

---

## 7. Performance Testing Plan

**Framework:** k6  
**Location:** `tests/performance/`

| Script | Scenario | Target |
|---|---|---|
| `search-load.js` | 100 virtual users, 5-minute duration, `searchFlights` queries | P95 ≤ 2000ms; error rate ≤ 1% |
| `booking-load.js` | 50 virtual users, 3-minute duration, `POST /bookings` | P95 ≤ 3000ms; error rate ≤ 1% |

k6 test fails CI if any threshold is exceeded.

---

## 8. Quality Gates

All gates must pass before a PR can be merged or a deployment can proceed.

| Gate | Condition | On Failure |
|---|---|---|
| Build Gate | `tsc --noEmit` exits with zero errors | Block merge |
| Lint Gate | ESLint exits with zero errors | Block merge |
| Unit Test Gate | All unit tests pass; coverage ≥ 80% on business logic | Block merge |
| Integration Test Gate | All 13 integration scenarios pass (including IT-004) | Block merge |
| Security Gate | `npm audit --audit-level=high` exits with zero findings | Block merge |
| Contract Gate | `npm run validate:schema` passes | Block merge |
| Performance Gate | k6 P95 search ≤ 2000ms; error rate ≤ 1% | Block deployment to staging |

---

## 9. Test Data Strategy

| Strategy | Detail |
|---|---|
| Seed data | `tests/fixtures/seed.sql` airports, sample flights, test users pre-loaded for integration tests |
| Database isolation | Separate `flight_booking_test` database; migrations reset before each integration test suite |
| No production data | All test data is synthetic; no real PII is ever used |
| Booking reference collisions | `BookingReferenceFactory` uses cryptographically random generation to avoid conflicts across parallel tests |

---

## 10. Defect Management

| Step | Process |
|---|---|
| Detection | Automated CI failure; manual test; security audit finding |
| Classification | P1 (data loss, security breach, overbooking), P2 (functional failure), P3 (degraded UX), P4 (cosmetic) |
| Root Cause | Every P1/P2 bug requires a root cause comment in the fix PR |
| Regression | Every bug fix must include a failing test that would have caught it |

---

## 11. Quality Metrics

| Metric | Target | Collection Method |
|---|---|---|
| Unit test coverage (business logic) | ≥ 80% | Vitest `--coverage` (CI) |
| Integration test pass rate | 100% | CI pipeline |
| Concurrent booking test (IT-004) | Always passes | CI pipeline |
| Security vulnerabilities (high+critical) | 0 | `npm audit` (CI) |
| P95 search response time | ≤ 2000ms | k6 nightly |
| API error rate under load | ≤ 1% | k6 nightly |

---

*Document controlled under the MikunAir Backend documentation governance.*  
*Next review: triggered by any new endpoint, new domain rule, or test failure pattern.*
