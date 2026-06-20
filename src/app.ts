import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { graphql, parse, validate } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import depthLimit from 'graphql-depth-limit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getDb } from './shared/database/index.js';
import { correlationIdMiddleware } from './shared/auth/index.js';
import { errorHandler } from './shared/errors/index.js';
import { logger } from './shared/logger/index.js';
import { eventBus } from './shared/events/index.js';
import type { BookingConfirmedEvent, BookingCancelledEvent } from './shared/events/index.js';

// Repositories
import { PostgresUserRepository } from './modules/identity/repository/postgres-user.repository.js';
import { PostgresFlightRepository } from './modules/flight/repository/postgres-flight.repository.js';
import { PostgresBookingRepository } from './modules/booking/repository/postgres-booking.repository.js';
import { PostgresPassengerRepository } from './modules/passenger/repository/postgres-passenger.repository.js';

// Domain services
import { IdentityService } from './modules/identity/domain/identity.service.js';
import { FlightAvailabilityService } from './modules/flight/domain/flight-availability.service.js';
import { BookingService } from './modules/booking/domain/booking.service.js';
import { NotificationService } from './modules/notification/notification.service.js';

// Handlers
import { AuthHandlers } from './modules/identity/handlers/auth.handlers.js';
import { BookingHandlers } from './modules/booking/handlers/booking.handlers.js';
import { PassengerHandlers } from './modules/passenger/handlers/passenger.handlers.js';
import { AdminHandlers } from './modules/admin/handlers/admin.handlers.js';

// Routers
import { createIdentityRouter } from './modules/identity/identity.router.js';
import { createBookingRouter } from './modules/booking/booking.router.js';
import { createPassengerRouter } from './modules/passenger/passenger.router.js';
import { createAdminRouter } from './modules/admin/admin.router.js';

// GraphQL
import { createResolvers } from './graphql/resolvers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): express.Application {
  const db = getDb();

  // ── Repositories (DIP: injected into services via interface) ──────────────
  const userRepo = new PostgresUserRepository(db);
  const flightRepo = new PostgresFlightRepository(db);
  const bookingRepo = new PostgresBookingRepository(db);
  const passengerRepo = new PostgresPassengerRepository(db);

  // ── Domain Services ───────────────────────────────────────────────────────
  const identityService = new IdentityService(userRepo);
  const flightService = new FlightAvailabilityService(flightRepo);
  const bookingService = new BookingService(bookingRepo, flightRepo, db, eventBus);
  const notificationService = new NotificationService();

  // ── Event Subscriptions ───────────────────────────────────────────────────
  eventBus.subscribe<BookingConfirmedEvent>('booking.confirmed', (e) =>
    notificationService.sendBookingConfirmation(e),
  );
  eventBus.subscribe<BookingCancelledEvent>('booking.cancelled', (e) =>
    notificationService.sendBookingCancellation(e),
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const authHandlers = new AuthHandlers(identityService);
  const bookingHandlers = new BookingHandlers(bookingService);
  const passengerHandlers = new PassengerHandlers(passengerRepo);
  const adminHandlers = new AdminHandlers(flightRepo);

  // ── GraphQL Schema ────────────────────────────────────────────────────────
  const typeDefs = readFileSync(
    path.join(__dirname, 'graphql/schema.graphql'),
    'utf-8',
  );
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: createResolvers(flightService),
  });

  // ── Express App ───────────────────────────────────────────────────────────
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — restrict to frontend origin in production
  app.use(
    cors({
      origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));
  app.use(correlationIdMiddleware);

  // Request logging
  app.use((req, _res, next) => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      correlationId: req.headers['x-correlation-id'],
    });
    next();
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // ── GraphQL endpoint ──────────────────────────────────────────────────────
  app.post('/graphql', async (req, res) => {
    const { query, variables, operationName } = req.body as {
      query?: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    };

    if (!query) {
      res.status(400).json({ errors: [{ message: 'Missing query' }] });
      return;
    }

    let document;
    try {
      document = parse(query);
    } catch (err) {
      res.status(400).json({ errors: [{ message: String(err) }] });
      return;
    }

    const validationErrors = validate(schema, document, [depthLimit(5)]);
    if (validationErrors.length) {
      res.status(400).json({ errors: validationErrors.map((e) => ({ message: e.message })) });
      return;
    }

    const result = await graphql({ schema, source: query, variableValues: variables, operationName });
    res.status(200).json(result);
  });

  // ── REST endpoints ────────────────────────────────────────────────────────
  const v1 = '/api/v1';
  app.use(v1, createIdentityRouter(authHandlers));
  app.use(`${v1}/bookings`, createBookingRouter(bookingHandlers));
  app.use(`${v1}/passengers`, createPassengerRouter(passengerHandlers));
  app.use(`${v1}/admin`, createAdminRouter(adminHandlers));

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'mikunair-backend' });
  });

  // Centralised error handler (must be last)
  app.use(errorHandler);

  return app;
}
