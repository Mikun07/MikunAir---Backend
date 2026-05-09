import { z } from 'zod';

// ─── Value Object Schemas ─────────────────────────────────────────────────────

export const IataCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter IATA airport code (e.g. LHR)');

export const BookingReferenceSchema = z
  .string()
  .length(6)
  .regex(/^[A-Z0-9]{6}$/, 'Must be a 6-character alphanumeric booking reference');

export const SeatClassSchema = z.enum(['ECONOMY', 'BUSINESS']);

export const DocumentTypeSchema = z.enum(['PASSPORT', 'ID_CARD']);

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: 'You must consent to data processing to register' }),
  }),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// ─── Passenger Schema ─────────────────────────────────────────────────────────

export const PassengerInputSchema = z.object({
  fullName: z.string().min(2).max(255),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format'),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(5).max(50),
});

// ─── Booking Schemas ──────────────────────────────────────────────────────────

export const CreateBookingSchema = z.object({
  outboundFlightId: z.string().uuid('Must be a valid flight ID'),
  inboundFlightId: z.string().uuid().optional(),
  seatClass: SeatClassSchema,
  passengers: z
    .array(PassengerInputSchema)
    .min(1, 'At least one passenger is required')
    .max(9, 'Maximum 9 passengers per booking'),
});

// ─── Admin Flight Schemas ─────────────────────────────────────────────────────

export const CreateFlightSchema = z.object({
  flightNumber: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z]{2}\d{3,4}$/, 'Flight number format: 2 letters + 3-4 digits (e.g. SK401)'),
  originIata: IataCodeSchema,
  destinationIata: IataCodeSchema,
  departureAt: z.string().datetime({ message: 'Must be a valid ISO 8601 datetime' }),
  arrivalAt: z.string().datetime({ message: 'Must be a valid ISO 8601 datetime' }),
  economySeatsTotal: z.number().int().positive(),
  businessSeatsTotal: z.number().int().positive(),
  economyFarePence: z.number().int().nonnegative('Fare must be in non-negative integer pence'),
  businessFarePence: z.number().int().nonnegative('Fare must be in non-negative integer pence'),
});

export const UpdateFlightSchema = CreateFlightSchema.partial();

// ─── Flight Search Schema ─────────────────────────────────────────────────────

export const FlightSearchParamsSchema = z.object({
  origin: IataCodeSchema,
  destination: IataCodeSchema,
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format'),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  passengers: z.coerce.number().int().min(1).max(9),
  seatClass: SeatClassSchema.optional(),
});

// ─── Saved Passenger Profile Schemas ──────────────────────────────────────────

export const SavePassengerProfileSchema = PassengerInputSchema;

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type PassengerInput = z.infer<typeof PassengerInputSchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type CreateFlightInput = z.infer<typeof CreateFlightSchema>;
export type UpdateFlightInput = z.infer<typeof UpdateFlightSchema>;
export type FlightSearchParams = z.infer<typeof FlightSearchParamsSchema>;
