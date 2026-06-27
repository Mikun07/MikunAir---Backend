import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { BookingService } from './booking.service.js';
import {
  BookingNotFoundError,
  BookingAlreadyCancelledError,
  ForbiddenError,
  FlightNotFoundError,
} from '../../../shared/errors/index.js';
import type { IBookingRepository, Booking, CreateBookingDTO } from './types.js';
import type { IFlightRepository, Flight } from '../../flight/domain/types.js';
import type { Db } from '../../../shared/database/index.js';

beforeAll(() => {
  process.env['JWT_SECRET'] = 'test-access-secret';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
});

function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: 'flight-1',
    flightNumber: 'SK100',
    origin: { iataCode: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', timezone: 'Europe/London' },
    destination: { iataCode: 'ARN', name: 'Arlanda', city: 'Stockholm', country: 'SE', timezone: 'Europe/Stockholm' },
    departureAt: new Date('2026-07-01T10:00:00Z'),
    arrivalAt: new Date('2026-07-01T13:00:00Z'),
    economySeatsTotal: 150,
    economySeatsAvailable: 10,
    businessSeatsTotal: 20,
    businessSeatsAvailable: 5,
    economyFarePence: 8500,
    businessFarePence: 32000,
    status: 'SCHEDULED',
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    reference: 'ABC123',
    userId: 'user-1',
    status: 'CONFIRMED',
    totalPricePence: 8500,
    segments: [],
    passengers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDto(overrides: Partial<CreateBookingDTO> = {}): CreateBookingDTO {
  return {
    outboundFlightId: 'flight-1',
    seatClass: 'ECONOMY',
    passengers: [{ fullName: 'Ada Lovelace', dateOfBirth: '1990-01-01', documentType: 'PASSPORT', documentNumber: 'P12345' }],
    userId: 'user-1',
    ...overrides,
  };
}

function makeBookingRepo(overrides: Partial<IBookingRepository> = {}): IBookingRepository {
  return {
    create: vi.fn().mockResolvedValue(makeBooking()),
    findById: vi.fn().mockResolvedValue(null),
    findByReference: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    findAllForFlight: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeFlightRepo(flight: Flight | null = makeFlight()): IFlightRepository {
  return {
    findAvailable: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(flight),
    decrementSeatCount: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  };
}

function makeDb(): Db {
  const trx = {
    execute: vi.fn().mockResolvedValue({ rows: [{ id: 'flight-1', seats: 10 }] }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  };
  return {
    transaction: vi.fn().mockImplementation(async (fn: (trx: unknown) => Promise<Booking>) => fn(trx)),
  } as unknown as Db;
}

function makeEvents() {
  return { publish: vi.fn() };
}

describe('BookingService', () => {
  let bookingRepo: IBookingRepository;
  let flightRepo: IFlightRepository;
  let db: Db;
  let events: ReturnType<typeof makeEvents>;
  let service: BookingService;

  beforeEach(() => {
    bookingRepo = makeBookingRepo();
    flightRepo = makeFlightRepo();
    db = makeDb();
    events = makeEvents();
    service = new BookingService(bookingRepo, flightRepo, db, events as never);
  });

  describe('createBooking', () => {
    it('throws FlightNotFoundError when outbound flight does not exist', async () => {
      flightRepo = makeFlightRepo(null);
      service = new BookingService(bookingRepo, flightRepo, db, events as never);

      await expect(service.createBooking(makeDto())).rejects.toThrow(FlightNotFoundError);
    });

    it('returns a BookingConfirmation with CONFIRMED status', async () => {
      const result = await service.createBooking(makeDto());

      expect(result.status).toBe('CONFIRMED');
      expect(result.bookingId).toBe('booking-1');
      expect(result.reference).toBeTruthy();
      expect(result.totalPricePence).toBeGreaterThan(0);
    });

    it('calculates total price as farePerPassenger x passengerCount for economy', async () => {
      const dto = makeDto({
        seatClass: 'ECONOMY',
        passengers: [
          { fullName: 'Ada Lovelace', dateOfBirth: '1990-01-01', documentType: 'PASSPORT', documentNumber: 'P1' },
          { fullName: 'Grace Hopper', dateOfBirth: '1992-02-02', documentType: 'PASSPORT', documentNumber: 'P2' },
        ],
      });

      await service.createBooking(dto);

      // economy fare is 8500p, 2 passengers = 17000p
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalPricePence: 17000 }),
      );
    });

    it('calculates total price using business fare when seatClass is BUSINESS', async () => {
      const dto = makeDto({ seatClass: 'BUSINESS' });

      await service.createBooking(dto);

      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalPricePence: 32000 }),
      );
    });

    it('publishes a booking.confirmed event after successful booking', async () => {
      await service.createBooking(makeDto());

      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'booking.confirmed' }),
      );
    });

    it('calls updateStatus with CONFIRMED after transaction', async () => {
      await service.createBooking(makeDto());

      expect(bookingRepo.updateStatus).toHaveBeenCalledWith('booking-1', 'CONFIRMED');
    });
  });

  describe('cancelBooking', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(service.cancelBooking('missing', 'user-1')).rejects.toThrow(BookingNotFoundError);
    });

    it('throws ForbiddenError when user does not own the booking', async () => {
      vi.mocked(bookingRepo.findById).mockResolvedValue(makeBooking({ userId: 'other-user' }));

      await expect(service.cancelBooking('booking-1', 'user-1')).rejects.toThrow(ForbiddenError);
    });

    it('throws BookingAlreadyCancelledError when booking is already cancelled', async () => {
      vi.mocked(bookingRepo.findById).mockResolvedValue(makeBooking({ status: 'CANCELLED' }));

      await expect(service.cancelBooking('booking-1', 'user-1')).rejects.toThrow(BookingAlreadyCancelledError);
    });

    it('updates status to CANCELLED for a valid cancellation', async () => {
      vi.mocked(bookingRepo.findById).mockResolvedValue(makeBooking());

      await service.cancelBooking('booking-1', 'user-1');

      expect(bookingRepo.updateStatus).toHaveBeenCalledWith('booking-1', 'CANCELLED');
    });

    it('publishes a booking.cancelled event', async () => {
      vi.mocked(bookingRepo.findById).mockResolvedValue(makeBooking());

      await service.cancelBooking('booking-1', 'user-1');

      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'booking.cancelled' }),
      );
    });

    it('allows cancellation when booking has no userId (guest booking)', async () => {
      vi.mocked(bookingRepo.findById).mockResolvedValue(makeBooking({ userId: null }));

      await service.cancelBooking('booking-1', 'any-user');

      expect(bookingRepo.updateStatus).toHaveBeenCalledWith('booking-1', 'CANCELLED');
    });
  });

  describe('getBookingHistory', () => {
    it('returns all bookings for the user', async () => {
      const bookings = [makeBooking(), makeBooking({ id: 'booking-2', reference: 'DEF456' })];
      vi.mocked(bookingRepo.findByUserId).mockResolvedValue(bookings);

      const result = await service.getBookingHistory('user-1');

      expect(result).toEqual(bookings);
      expect(bookingRepo.findByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getBookingByReference', () => {
    it('throws BookingNotFoundError when reference does not exist', async () => {
      await expect(service.getBookingByReference('XXXXXX')).rejects.toThrow(BookingNotFoundError);
    });

    it('returns the booking when found', async () => {
      const booking = makeBooking();
      vi.mocked(bookingRepo.findByReference).mockResolvedValue(booking);

      const result = await service.getBookingByReference('ABC123');

      expect(result).toEqual(booking);
    });

    it('throws ForbiddenError when a different user requests the booking', async () => {
      vi.mocked(bookingRepo.findByReference).mockResolvedValue(makeBooking({ userId: 'owner' }));

      await expect(service.getBookingByReference('ABC123', 'other-user')).rejects.toThrow(ForbiddenError);
    });

    it('returns booking when the owner requests it', async () => {
      const booking = makeBooking({ userId: 'user-1' });
      vi.mocked(bookingRepo.findByReference).mockResolvedValue(booking);

      const result = await service.getBookingByReference('ABC123', 'user-1');

      expect(result).toEqual(booking);
    });
  });
});
