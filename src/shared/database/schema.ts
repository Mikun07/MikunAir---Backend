import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN']);
export const documentTypeEnum = pgEnum('document_type', ['PASSPORT', 'ID_CARD']);
export const flightStatusEnum = pgEnum('flight_status', ['SCHEDULED', 'CANCELLED', 'DEPARTED']);
export const seatClassEnum = pgEnum('seat_class', ['ECONOMY', 'BUSINESS']);
export const bookingStatusEnum = pgEnum('booking_status', ['PENDING', 'CONFIRMED', 'CANCELLED']);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('USER'),
    consentGivenAt: timestamp('consent_given_at', { withTimezone: true }).notNull(),
    consentWithdrawnAt: timestamp('consent_withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

// ─── Passenger Profiles ───────────────────────────────────────────────────────

export const passengerProfiles = pgTable('passenger_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  dateOfBirth: varchar('date_of_birth', { length: 10 }).notNull(),
  documentType: documentTypeEnum('document_type').notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  isAnonymised: boolean('is_anonymised').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Airports ─────────────────────────────────────────────────────────────────

export const airports = pgTable('airports', {
  iataCode: varchar('iata_code', { length: 3 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  country: varchar('country', { length: 100 }).notNull(),
  timezone: varchar('timezone', { length: 50 }).notNull(),
});

// ─── Flights ──────────────────────────────────────────────────────────────────

export const flights = pgTable(
  'flights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flightNumber: varchar('flight_number', { length: 10 }).notNull(),
    originIata: varchar('origin_iata', { length: 3 })
      .notNull()
      .references(() => airports.iataCode),
    destinationIata: varchar('destination_iata', { length: 3 })
      .notNull()
      .references(() => airports.iataCode),
    departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
    arrivalAt: timestamp('arrival_at', { withTimezone: true }).notNull(),
    economySeatsTotal: integer('economy_seats_total').notNull(),
    economySeatsAvailable: integer('economy_seats_available').notNull(),
    businessSeatsTotal: integer('business_seats_total').notNull(),
    businessSeatsAvailable: integer('business_seats_available').notNull(),
    // Fares stored as integer pence — DDR-002
    economyFarePence: integer('economy_fare_pence').notNull(),
    businessFarePence: integer('business_fare_pence').notNull(),
    status: flightStatusEnum('status').notNull().default('SCHEDULED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('flights_search_idx').on(t.originIata, t.destinationIata, t.departureAt),
    index('flights_flight_number_idx').on(t.flightNumber),
  ],
);

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: varchar('reference', { length: 6 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: bookingStatusEnum('status').notNull().default('PENDING'),
    totalPricePence: integer('total_price_pence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_reference_idx').on(t.reference),
    index('bookings_user_idx').on(t.userId),
  ],
);

// ─── Booking Segments ─────────────────────────────────────────────────────────

export const bookingSegments = pgTable('booking_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  flightId: uuid('flight_id')
    .notNull()
    .references(() => flights.id),
  seatClass: seatClassEnum('seat_class').notNull(),
  farePaidPence: integer('fare_paid_pence').notNull(),
});

// ─── Booking Passengers ───────────────────────────────────────────────────────

export const bookingPassengers = pgTable('booking_passengers', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  dateOfBirth: varchar('date_of_birth', { length: 10 }).notNull(),
  documentType: documentTypeEnum('document_type').notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  isAnonymised: boolean('is_anonymised').notNull().default(false),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    correlationId: varchar('correlation_id', { length: 36 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    actorId: varchar('actor_id', { length: 36 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
    index('audit_log_occurred_at_idx').on(t.occurredAt),
  ],
);

// ─── Schema Type Exports ──────────────────────────────────────────────────────

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PassengerProfileRow = typeof passengerProfiles.$inferSelect;
export type NewPassengerProfileRow = typeof passengerProfiles.$inferInsert;
export type AirportRow = typeof airports.$inferSelect;
export type FlightRow = typeof flights.$inferSelect;
export type NewFlightRow = typeof flights.$inferInsert;
export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;
export type BookingSegmentRow = typeof bookingSegments.$inferSelect;
export type NewBookingSegmentRow = typeof bookingSegments.$inferInsert;
export type BookingPassengerRow = typeof bookingPassengers.$inferSelect;
export type NewBookingPassengerRow = typeof bookingPassengers.$inferInsert;
export type AuditLogRow = typeof auditLog.$inferSelect;
