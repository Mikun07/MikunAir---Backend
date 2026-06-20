import { generateBookingReference } from './booking-reference.factory.js';
import {
  BookingNotFoundError,
  BookingAlreadyCancelledError,
  ForbiddenError,
  NoSeatsAvailableError,
} from '../../../shared/errors/index.js';
import type { eventBus as EventBusType } from '../../../shared/events/index.js';
import type { IBookingRepository, Booking, CreateBookingDTO, BookingConfirmation } from './types.js';
import type { IFlightRepository } from '../../flight/domain/types.js';
import { FlightAvailabilityService } from '../../flight/domain/flight-availability.service.js';
import type { Db } from '../../../shared/database/index.js';
import { sql } from 'drizzle-orm';

export class BookingService {
  private readonly flightAvailability: FlightAvailabilityService;

  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly flightRepository: IFlightRepository,
    private readonly db: Db,
    private readonly events: typeof EventBusType,
  ) {
    this.flightAvailability = new FlightAvailabilityService(flightRepository);
  }

  async createBooking(dto: CreateBookingDTO): Promise<BookingConfirmation> {
    const passengerCount = dto.passengers.length;

    // Verify outbound flight exists and has capacity (pre-check — not the atomic lock)
    const outbound = await this.flightAvailability.getFlightOrThrow(dto.outboundFlightId);
    this.flightAvailability.assertSeatsAvailable(outbound, dto.seatClass, passengerCount);

    let inboundFarePence = 0;
    if (dto.inboundFlightId) {
      const inbound = await this.flightAvailability.getFlightOrThrow(dto.inboundFlightId);
      this.flightAvailability.assertSeatsAvailable(inbound, dto.seatClass, passengerCount);
      inboundFarePence =
        dto.seatClass === 'BUSINESS'
          ? inbound.businessFarePence
          : inbound.economyFarePence;
    }

    const outboundFarePence =
      dto.seatClass === 'BUSINESS'
        ? outbound.businessFarePence
        : outbound.economyFarePence;

    const totalPricePence =
      (outboundFarePence + inboundFarePence) * passengerCount;

    const reference = generateBookingReference();

    // ── Atomic seat decrement using SELECT FOR UPDATE ──────────────────────────
    // This is the overbooking prevention mechanism (FR-015).
    // The transaction locks the flight rows before checking/decrementing seats,
    // so two concurrent requests for the last seat will serialise here.
    const booking = await this.db.transaction(async (trx) => {
      const seatColumn =
        dto.seatClass === 'ECONOMY' ? 'economy_seats_available' : 'business_seats_available';

      // Lock outbound flight row — SELECT FOR UPDATE
      const lockOutbound = await trx.execute(
        sql`SELECT id, ${sql.raw(seatColumn)} AS seats FROM flights WHERE id = ${dto.outboundFlightId} FOR UPDATE`,
      );
      const lockedOutbound = (lockOutbound as unknown as { rows: Array<{ id: string; seats: number }> }).rows[0];

      if (!lockedOutbound || lockedOutbound.seats < passengerCount) {
        throw new NoSeatsAvailableError();
      }

      // Decrement outbound seats
      await trx.execute(
        sql`UPDATE flights SET ${sql.raw(seatColumn)} = ${sql.raw(seatColumn)} - ${passengerCount}, updated_at = NOW() WHERE id = ${dto.outboundFlightId}`,
      );

      // Lock and decrement inbound flight if present
      if (dto.inboundFlightId) {
        const lockInbound = await trx.execute(
          sql`SELECT id, ${sql.raw(seatColumn)} AS seats FROM flights WHERE id = ${dto.inboundFlightId} FOR UPDATE`,
        );
        const lockedInbound = (lockInbound as unknown as { rows: Array<{ id: string; seats: number }> }).rows[0];

        if (!lockedInbound || lockedInbound.seats < passengerCount) {
          throw new NoSeatsAvailableError();
        }

        await trx.execute(
          sql`UPDATE flights SET ${sql.raw(seatColumn)} = ${sql.raw(seatColumn)} - ${passengerCount}, updated_at = NOW() WHERE id = ${dto.inboundFlightId}`,
        );
      }

      // Create the booking record inside the same transaction
      return this.bookingRepository.create({
        ...dto,
        reference,
        totalPricePence,
      });
    });

    // Update booking status to CONFIRMED post-transaction
    await this.bookingRepository.updateStatus(booking.id, 'CONFIRMED');

    this.events.publish({
      type: 'booking.confirmed',
      occurredAt: new Date(),
      bookingId: booking.id,
      bookingReference: reference,
      userId: dto.userId ?? null,
      passengerEmails: [],
      totalPricePence,
    });

    return {
      bookingId: booking.id,
      reference,
      status: 'CONFIRMED',
      totalPricePence,
    };
  }

  async cancelBooking(bookingId: string, requestingUserId: string): Promise<void> {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) throw new BookingNotFoundError(bookingId);

    if (booking.userId && booking.userId !== requestingUserId) {
      throw new ForbiddenError();
    }

    if (booking.status === 'CANCELLED') {
      throw new BookingAlreadyCancelledError();
    }

    await this.bookingRepository.updateStatus(bookingId, 'CANCELLED');

    this.events.publish({
      type: 'booking.cancelled',
      occurredAt: new Date(),
      bookingId: booking.id,
      bookingReference: booking.reference,
      userId: booking.userId,
    });
  }

  async getBookingHistory(userId: string): Promise<Booking[]> {
    return this.bookingRepository.findByUserId(userId);
  }

  async getBookingByReference(reference: string, requestingUserId?: string): Promise<Booking> {
    const booking = await this.bookingRepository.findByReference(reference);
    if (!booking) throw new BookingNotFoundError(reference);

    if (booking.userId && requestingUserId && booking.userId !== requestingUserId) {
      throw new ForbiddenError();
    }

    return booking;
  }
}
