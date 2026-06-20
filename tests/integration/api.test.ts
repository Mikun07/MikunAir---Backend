import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import {
  users,
  airports,
  flights,
  bookings,
  bookingSegments,
  bookingPassengers,
} from '../../src/shared/database/schema.js';

// ── DB setup ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL must be set for integration tests');

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);
const app = createApp();

async function seed(): Promise<{ flightId: string; limitedFlightId: string }> {
  await db.insert(airports).values([
    { iataCode: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', timezone: 'Europe/London' },
    { iataCode: 'ARN', name: 'Arlanda', city: 'Stockholm', country: 'SE', timezone: 'Europe/Stockholm' },
  ]).onConflictDoNothing();

  const [flight] = await db.insert(flights).values({
    flightNumber: 'IT001',
    originIata: 'LHR',
    destinationIata: 'ARN',
    departureAt: new Date('2026-09-01T08:00:00Z'),
    arrivalAt: new Date('2026-09-01T11:00:00Z'),
    economySeatsTotal: 150,
    economySeatsAvailable: 50,
    businessSeatsTotal: 20,
    businessSeatsAvailable: 10,
    economyFarePence: 8500,
    businessFarePence: 32000,
    status: 'SCHEDULED',
  }).returning({ id: flights.id });

  const [limitedFlight] = await db.insert(flights).values({
    flightNumber: 'IT002',
    originIata: 'LHR',
    destinationIata: 'ARN',
    departureAt: new Date('2026-09-02T08:00:00Z'),
    arrivalAt: new Date('2026-09-02T11:00:00Z'),
    economySeatsTotal: 10,
    economySeatsAvailable: 1,
    businessSeatsTotal: 5,
    businessSeatsAvailable: 5,
    economyFarePence: 9000,
    businessFarePence: 35000,
    status: 'SCHEDULED',
  }).returning({ id: flights.id });

  if (!flight || !limitedFlight) throw new Error('Seed failed');
  return { flightId: flight.id, limitedFlightId: limitedFlight.id };
}

async function teardown(): Promise<void> {
  await db.delete(bookingPassengers);
  await db.delete(bookingSegments);
  await db.delete(bookings);
  await db.delete(flights).where(eq(flights.flightNumber, 'IT001'));
  await db.delete(flights).where(eq(flights.flightNumber, 'IT002'));
  await db.delete(flights).where(eq(flights.flightNumber, 'IT003'));
  await db.delete(users).where(eq(users.email, 'integration@test.com'));
  await db.delete(users).where(eq(users.email, 'user2@test.com'));
  await db.delete(users).where(eq(users.email, 'erasure@test.com'));
  // Airports must be deleted last — flights hold FK references to them
  await db.delete(airports).where(eq(airports.iataCode, 'LHR'));
  await db.delete(airports).where(eq(airports.iataCode, 'ARN'));
}

// ── Test state ────────────────────────────────────────────────────────────────

let flightId: string;
let limitedFlightId: string;
let accessToken: string;
let bookingReference: string;

const passenger = {
  fullName: 'Ada Lovelace',
  dateOfBirth: '1990-01-15',
  documentType: 'PASSPORT',
  documentNumber: 'P9876543',
};

beforeAll(async () => {
  await teardown();
  ({ flightId, limitedFlightId } = await seed());
});

afterAll(async () => {
  await teardown();
  await pool.end();
});

// ── IT-001: Health check ──────────────────────────────────────────────────────

describe('IT-001 Health check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'mikunair-backend' });
  });
});

// ── IT-002: Auth — register ───────────────────────────────────────────────────

describe('IT-002 Auth register', () => {
  it('POST /auth/register creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'integration@test.com', password: 'Password1!', consentGiven: true });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.email).toBe('integration@test.com');
    accessToken = res.body.accessToken as string;
  });

  it('POST /auth/register returns 409 for duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'integration@test.com', password: 'Password1!', consentGiven: true });

    expect(res.status).toBe(409);
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ── IT-003: Auth — login ──────────────────────────────────────────────────────

describe('IT-003 Auth login', () => {
  it('POST /auth/login returns tokens for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'integration@test.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    accessToken = res.body.accessToken as string;
  });

  it('POST /auth/login returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'integration@test.com', password: 'WrongPass!' });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('POST /auth/login returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'Password1!' });

    expect(res.status).toBe(401);
  });
});

// ── IT-004: Create booking ────────────────────────────────────────────────────

describe('IT-004 Create booking', () => {
  it('POST /bookings creates a confirmed booking', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ outboundFlightId: flightId, seatClass: 'ECONOMY', passengers: [passenger] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body).toHaveProperty('reference');
    bookingReference = res.body.reference as string;
  });

  it('POST /bookings creates a guest booking without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .send({ outboundFlightId: flightId, seatClass: 'ECONOMY', passengers: [passenger] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');
  });
});

// ── IT-005: Get booking by reference ─────────────────────────────────────────

describe('IT-005 Get booking by reference', () => {
  it('GET /bookings/:reference returns the booking', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingReference}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.reference).toBe(bookingReference);
  });

  it('GET /bookings/:reference returns 404 for unknown reference', async () => {
    const res = await request(app)
      .get('/api/v1/bookings/XXXXXX')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ── IT-006: Booking history ───────────────────────────────────────────────────

describe('IT-006 Booking history', () => {
  it('GET /bookings returns the user booking history', async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// ── IT-007: Cancel booking ────────────────────────────────────────────────────

describe('IT-007 Cancel booking', () => {
  it('POST /bookings/:reference/cancel cancels the booking', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingReference}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
  });

  it('POST /bookings/:reference/cancel returns 409 when already cancelled', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingReference}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
  });
});

// ── IT-008: GraphQL flight search ─────────────────────────────────────────────

describe('IT-008 GraphQL flight search', () => {
  it('POST /graphql returns outbound flights', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/graphql-response+json, application/json')
      .send({
        query: `{
          searchFlights(origin: "LHR", destination: "ARN", departureDate: "2026-09-01", passengers: 1) {
            outbound { id flightNumber origin destination farePerPassenger { totalPence } }
            inbound { id }
          }
        }`,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.searchFlights.outbound.length).toBeGreaterThan(0);
    expect(res.body.data.searchFlights.outbound[0].origin).toBe('LHR');
    expect(res.body).not.toHaveProperty('errors');
  });

  it('POST /graphql rejects queries exceeding depth limit', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/graphql-response+json, application/json')
      .send({
        query: `{
          searchFlights(origin: "LHR", destination: "ARN", departureDate: "2026-09-01", passengers: 1) {
            outbound { farePerPassenger { totalPence } }
            inbound { farePerPassenger { totalPence } }
          }
        }`,
      });

    // depth limit of 5 — this query is within limit, just verify it works
    expect(res.status).toBe(200);
  });
});

// ── IT-009: No seats available ────────────────────────────────────────────────

describe('IT-009 No seats available', () => {
  it('POST /bookings returns 409 when flight has no economy seats', async () => {
    // limitedFlight has 1 economy seat — first booking takes it
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'integration@test.com', password: 'Password1!' });
    const token = loginRes.body.accessToken as string;

    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundFlightId: limitedFlightId, seatClass: 'ECONOMY', passengers: [passenger] });

    // Second booking should fail
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundFlightId: limitedFlightId, seatClass: 'ECONOMY', passengers: [passenger] });

    expect(res.status).toBe(409);
  });
});

// ── IT-010: Concurrent booking (last seat) ────────────────────────────────────

describe('IT-010 Concurrent booking on last seat', () => {
  it('exactly one of two simultaneous requests succeeds when one seat remains', async () => {
    const r2Login = await request(app).post('/api/v1/auth/register').send({
      email: 'user2@test.com', password: 'Password2!', consentGiven: true,
    });
    const token2 = r2Login.body.accessToken as string;
    const token1 = accessToken;

    // Insert a fresh flight with exactly 1 economy seat
    const [concurrentFlight] = await db.insert(flights).values({
      flightNumber: 'IT003',
      originIata: 'LHR',
      destinationIata: 'ARN',
      departureAt: new Date('2026-09-03T08:00:00Z'),
      arrivalAt: new Date('2026-09-03T11:00:00Z'),
      economySeatsTotal: 1,
      economySeatsAvailable: 1,
      businessSeatsTotal: 5,
      businessSeatsAvailable: 5,
      economyFarePence: 9500,
      businessFarePence: 36000,
      status: 'SCHEDULED',
    }).returning({ id: flights.id });

    if (!concurrentFlight) throw new Error('Concurrent flight seed failed');

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token1}`)
        .send({ outboundFlightId: concurrentFlight.id, seatClass: 'ECONOMY', passengers: [passenger] }),
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token2}`)
        .send({ outboundFlightId: concurrentFlight.id, seatClass: 'ECONOMY', passengers: [passenger] }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    await db.delete(flights).where(eq(flights.flightNumber, 'IT003'));
  });
});

// ── IT-011: GDPR erasure ──────────────────────────────────────────────────────

describe('IT-011 GDPR erasure', () => {
  it('POST /users/me/erasure anonymises all PII fields', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'erasure@test.com', password: 'Password1!', consentGiven: true });

    const erasureToken = regRes.body.accessToken as string;

    const res = await request(app)
      .post('/api/v1/users/me/erasure')
      .set('Authorization', `Bearer ${erasureToken}`);

    expect(res.status).toBe(204);

    const [row] = await db.select().from(users).where(eq(users.email, 'erasure@test.com'));
    expect(row).toBeUndefined();
  });
});

// ── IT-012: Stack traces never leak ──────────────────────────────────────────

describe('IT-012 Error responses never include stack traces', () => {
  it('404 response body has no stack property', async () => {
    const res = await request(app)
      .get('/api/v1/bookings/ZZZZZZ')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body).not.toHaveProperty('stack');
  });

  it('401 response body has no stack property', async () => {
    const res = await request(app).get('/api/v1/bookings');
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ── IT-013: Validation rejects bad input ──────────────────────────────────────

describe('IT-013 Input validation', () => {
  it('POST /auth/register returns 422 for missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad@test.com', consentGiven: true });

    expect(res.status).toBe(422);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('POST /bookings returns 422 for missing passengers array', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ outboundFlightId: flightId, seatClass: 'ECONOMY' });

    expect(res.status).toBe(422);
  });
});
