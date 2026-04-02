# MikunAir — Backend API

Node.js/Express/TypeScript REST + GraphQL API for the MikunAir flight booking platform.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Database](#database)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Docker](#docker)
- [Architecture Notes](#architecture-notes)

---

## Overview

This service is the backend for MikunAir a professional-grade flight booking application built as a portfolio project targeting a Full Stack Developer role.

It exposes:
- A **REST API** (`/api/v1`) for auth, bookings, passengers, and admin operations
- A **GraphQL API** (`/graphql`) for flight search
- A `/health` endpoint for container health checks

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (ESM) |
| Framework | Express 4 |
| Language | TypeScript 5 (`NodeNext` modules) |
| Database | PostgreSQL 16 |
| ORM / Query Builder | Drizzle ORM |
| GraphQL | `graphql` + `graphql-http` + `@graphql-tools/schema` |
| Authentication | JWT (`jsonwebtoken`) access tokens in memory, refresh tokens in HTTP-only cookies |
| Validation | Zod |
| Logging | Winston (structured JSON, PII-sanitised) |
| Email | Nodemailer (dev: Mailhog SMTP) |
| Testing | Vitest (unit) + Supertest (integration) |
| Linting | ESLint + `@typescript-eslint` |

---

## Project Structure

```
backend/
├── src/
│   ├── server.ts                  # Entry point binds HTTP server, handles SIGTERM/SIGINT
│   ├── app.ts                     # Express app factory wires DI graph
│   ├── graphql/
│   │   ├── schema.graphql         # SDL type definitions
│   │   └── resolvers.ts           # Query resolvers
│   ├── modules/
│   │   ├── identity/              # Auth & user management
│   │   │   ├── domain/            # IdentityService, types
│   │   │   ├── handlers/          # HTTP request handlers
│   │   │   ├── repository/        # PostgresUserRepository
│   │   │   └── identity.router.ts
│   │   ├── flight/                # Flight availability
│   │   │   ├── domain/            # FlightAvailabilityService, types
│   │   │   └── repository/        # PostgresFlightRepository
│   │   ├── booking/               # Booking lifecycle
│   │   │   ├── domain/            # BookingService, types, reference factory
│   │   │   ├── handlers/
│   │   │   ├── repository/        # PostgresBookingRepository
│   │   │   └── booking.router.ts
│   │   ├── passenger/             # Saved passenger profiles
│   │   │   ├── domain/
│   │   │   ├── handlers/
│   │   │   ├── repository/        # PostgresPassengerRepository
│   │   │   └── passenger.router.ts
│   │   ├── notification/          # Email notifications (event-driven)
│   │   │   └── notification.service.ts
│   │   └── admin/                 # Flight management (ADMIN role only)
│   │       ├── handlers/
│   │       └── admin.router.ts
│   └── shared/
│       ├── auth/                  # JWT sign/verify, Express middleware, correlation ID
│       ├── database/              # Drizzle connection, schema, migrations
│       ├── errors/                # Domain error classes + centralised error handler
│       ├── events/                # In-process event bus (EventEmitter)
│       ├── logger/                # Winston logger + PII sanitiser
│       └── validation/            # Zod schemas for request bodies
├── scripts/
│   └── validate-schema.ts         # Checks Drizzle schema exports at startup
├── tests/
│   ├── integration/               # Supertest + real PostgreSQL integration tests
│   └── performance/               # k6 load test scripts
├── .github/
│   └── workflows/
│       └── ci.yml                 # Backend CI pipeline
├── drizzle.config.ts
├── vitest.config.ts
├── vitest.integration.config.ts
├── .env.example
├── Dockerfile
└── package.json
```

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10
- **PostgreSQL** 16 (or Docker see [Docker](#docker))
- **Git**

---

## Local Setup

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd backend
npm install
```

**2. Configure environment**

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in all values. See [Environment Variables](#environment-variables) for details.

**3. Start PostgreSQL**

If you have Docker:

```bash
docker run -d \
  --name mikunair-postgres \
  -e POSTGRES_USER=dev \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=flight_booking_dev \
  -p 5432:5432 \
  postgres:16-alpine
```

**4. Run database migrations**

```bash
npm run db:generate    # generates SQL migration files from schema
npm run db:migrate     # applies migrations to the database
```

**5. Start the dev server**

```bash
npm run dev
```

The server starts on `http://localhost:3000` with hot-reload via `tsx watch`.

---

## Environment Variables

All variables are required unless marked optional.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret for signing access tokens (min 32 chars) | — |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (min 32 chars) | — |
| `NODE_ENV` | `development` \| `production` \| `test` | `development` |
| `PORT` | HTTP port | `3000` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `SMTP_HOST` | SMTP server host | `localhost` |
| `SMTP_PORT` | SMTP server port | `1025` |
| `SMTP_USER` | SMTP username *(optional omit for unauthenticated)* | — |
| `SMTP_PASS` | SMTP password *(optional)* | — |
| `LOG_LEVEL` | Winston log level (`debug`, `info`, `warn`, `error`) | `info` |

> **Never commit `.env.local` or any file containing real secrets.**

---

## Running the Server

| Command | Description |
|---|---|
| `npm run dev` | Start with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (`node dist/server.js`) |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | ESLint across `src/` |
| `npm run lint:fix` | ESLint with auto-fix |

---

## Database

Managed with **Drizzle ORM**. Schema is defined in `src/shared/database/schema.ts`.

| Command | Description |
|---|---|
| `npm run db:generate` | Generate SQL migration files from current schema |
| `npm run db:migrate` | Apply pending migrations to the database |
| `npm run db:studio` | Open Drizzle Studio (visual database browser) |
| `npm run validate:schema` | Validate schema exports are consistent |

Migration files are generated into `drizzle/` and should be committed to version control.

---

## API Reference

### Base URL

```
REST:    http://localhost:3000/api/v1
GraphQL: http://localhost:3000/graphql
Health:  http://localhost:3000/health
```

### Authentication

Access tokens are returned in the response body and must be sent as:

```
Authorization: Bearer <access_token>
```

Refresh tokens are set as HTTP-only cookies automatically.

---

### Identity — `/api/v1/auth` and `/api/v1/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Create account + return tokens |
| `POST` | `/auth/login` | None | Login + return tokens |
| `POST` | `/auth/refresh` | Cookie | Exchange refresh token for new access token |
| `POST` | `/auth/logout` | Bearer | Revoke session |
| `POST` | `/users/me/erasure` | Bearer | GDPR erasure anonymise all PII |

---

### Bookings — `/api/v1/bookings`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/bookings` | Optional Bearer | Create a booking (guests allowed) |
| `GET` | `/bookings` | Bearer | List authenticated user's bookings |
| `GET` | `/bookings/:reference` | Optional Bearer | Get booking by reference |
| `POST` | `/bookings/:id/cancel` | Bearer | Cancel a booking |

---

### Passengers — `/api/v1/passengers`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/passengers` | Bearer | List saved passenger profiles |
| `POST` | `/passengers` | Bearer | Create or update a passenger profile |
| `DELETE` | `/passengers/:id` | Bearer | Delete a passenger profile |

---

### Admin — `/api/v1/admin`

All admin endpoints require a valid Bearer token with the `ADMIN` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/flights` | ADMIN | List all flights |
| `POST` | `/admin/flights` | ADMIN | Create a new flight |
| `PATCH` | `/admin/flights/:id` | ADMIN | Update flight details |
| `DELETE` | `/admin/flights/:id` | ADMIN | Deactivate a flight |

---

### GraphQL — `/graphql`

Flight search is exposed exclusively via GraphQL.

```graphql
query SearchFlights(
  $origin: String!
  $destination: String!
  $departureDate: String!
  $passengers: Int!
  $returnDate: String
  $seatClass: SeatClass
) {
  searchFlights(
    origin: $origin
    destination: $destination
    departureDate: $departureDate
    passengers: $passengers
    returnDate: $returnDate
    seatClass: $seatClass
  ) {
    outbound {
      id
      flightNumber
      departureAt
      arrivalAt
      durationMinutes
      availableSeats
      farePerPassenger {
        baseFarePence
        taxesPence
        totalPence
        currency
      }
    }
    inbound {
      id
      flightNumber
      departureAt
      arrivalAt
    }
  }
}
```

Query depth is limited to **5 levels** to prevent abuse.

---

## Testing

### Unit Tests

```bash
npm test                  # run once
npm run test:watch        # watch mode
npm run test:coverage     # with V8 coverage report
```

Unit tests live alongside source files (`*.test.ts` or `*.spec.ts`). Target: **80% coverage on all domain services**.

### Integration Tests

```bash
npm run test:integration
```

Integration test files live in `tests/integration/`. They run against a real PostgreSQL instance `DATABASE_URL` must point to a running test database. Covers 13 scenarios including the concurrent booking race condition (two simultaneous requests for the last available seat).

### Performance Tests

Load test scripts live in `tests/performance/` and are written for **k6**. Target: P95 flight search response ≤ 2000ms under 100 concurrent users.

---

## Docker

### Development (with hot-reload)

```bash
docker build --target development -t mikunair-backend:dev .
docker run -p 3000:3000 --env-file .env.local mikunair-backend:dev
```

### Production

```bash
docker build --target production -t mikunair-backend:prod .
docker run -p 3000:3000 --env-file .env.production mikunair-backend:prod
```

The production image:
- Runs as a non-root user (`appuser`)
- Includes only production dependencies
- Has a health check on `/health`

For the full stack with PostgreSQL and Mailhog, use the root-level `docker-compose.yml`.

---

## Architecture Notes

**Dependency Injection** — `app.ts` is the composition root. Repositories are constructed once and injected into domain services via interfaces. No module imports a concrete repository directly.

**Business logic placement** — All business rules live in domain services (`*.service.ts`). Handlers are thin HTTP adapters that delegate immediately to a service. Repositories are pure data access with no business logic.

**Money handling** — All fare and price values are stored and calculated as integer pence (`number` in TypeScript, `INTEGER` in PostgreSQL). No floating-point arithmetic for money.

**Overbooking prevention** — `BookingService.createBooking` uses a `SELECT FOR UPDATE` transaction to atomically check and decrement seat counts. Two concurrent requests for the last seat will serialise at the database level; the second will receive a `409 Conflict`.

**Event bus** — An in-process `EventEmitter`-based bus (`shared/events`) decouples booking lifecycle events from notification delivery. `booking.confirmed` and `booking.cancelled` events trigger email notifications asynchronously.

**Security** — Access tokens are never persisted. Refresh tokens live in HTTP-only cookies. All API responses use explicit DTO projections the raw database entity is never serialised directly. Stack traces are stripped from error responses in production.

**Logging** — All structured log output passes through a PII sanitiser before reaching Winston. Fields named `email`, `password`, `token`, and similar are redacted automatically.
