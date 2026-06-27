import { eq, desc } from 'drizzle-orm';
import type { Db } from '../../../shared/database/index.js';
import {
  bookings,
  bookingSegments,
  bookingPassengers,
  flights,
  airports,
} from '../../../shared/database/index.js';
import type {
  IBookingRepository,
  Booking,
  BookingSegment,
  BookingPassenger,
  BookingStatus,
  BookingHistoryEntry,
  FlightHistorySegment,
  CreateBookingDTO,
} from '../domain/types.js';

type CreateInput = CreateBookingDTO & { reference: string; totalPricePence: number };

export class PostgresBookingRepository implements IBookingRepository {
  constructor(private readonly db: Db) {}

  async create(dto: CreateInput): Promise<Booking> {
    const [bookingRow] = await this.db
      .insert(bookings)
      .values({
        reference: dto.reference,
        userId: dto.userId ?? null,
        status: 'PENDING',
        totalPricePence: dto.totalPricePence,
      })
      .returning();

    if (!bookingRow) throw new Error('Booking insert returned no rows');

    const farePence =
      dto.seatClass === 'BUSINESS'
        ? dto.totalPricePence / dto.passengers.length
        : dto.totalPricePence / dto.passengers.length;

    const segmentValues = [dto.outboundFlightId, dto.inboundFlightId]
      .filter((id): id is string => Boolean(id))
      .map((flightId) => ({
        bookingId: bookingRow.id,
        flightId,
        seatClass: dto.seatClass,
        farePaidPence: Math.round(farePence),
      }));

    const segmentRows = await this.db
      .insert(bookingSegments)
      .values(segmentValues)
      .returning();

    const passengerRows = await this.db
      .insert(bookingPassengers)
      .values(
        dto.passengers.map((p) => ({
          bookingId: bookingRow.id,
          fullName: p.fullName,
          dateOfBirth: p.dateOfBirth,
          documentType: p.documentType,
          documentNumber: p.documentNumber,
        })),
      )
      .returning();

    return this.toBooking(bookingRow, segmentRows, passengerRows);
  }

  async findById(id: string): Promise<Booking | null> {
    return this.findWith(eq(bookings.id, id));
  }

  async findByReference(reference: string): Promise<Booking | null> {
    return this.findWith(eq(bookings.reference, reference));
  }

  async findByUserId(userId: string): Promise<Booking[]> {
    const bookingRows = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(bookings.createdAt);

    return Promise.all(bookingRows.map((b) => this.loadRelations(b)));
  }

  async updateStatus(id: string, status: BookingStatus): Promise<void> {
    await this.db
      .update(bookings)
      .set({ status, updatedAt: new Date() })
      .where(eq(bookings.id, id));
  }

  async findHistoryByUserId(userId: string): Promise<BookingHistoryEntry[]> {
    // Single join: bookings → booking_segments → flights → origin airport → destination airport
    const originAirports = airports;
    const destinationAirports = {
      iataCode: airports.iataCode,
      city: airports.city,
    };

    const rows = await this.db
      .select({
        bookingId: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        totalPricePence: bookings.totalPricePence,
        createdAt: bookings.createdAt,
        segmentId: bookingSegments.id,
        flightId: flights.id,
        flightNumber: flights.flightNumber,
        originIata: flights.originIata,
        destinationIata: flights.destinationIata,
        departureAt: flights.departureAt,
        arrivalAt: flights.arrivalAt,
        seatClass: bookingSegments.seatClass,
        farePaidPence: bookingSegments.farePaidPence,
        originCity: originAirports.city,
      })
      .from(bookings)
      .innerJoin(bookingSegments, eq(bookingSegments.bookingId, bookings.id))
      .innerJoin(flights, eq(flights.id, bookingSegments.flightId))
      .innerJoin(originAirports, eq(originAirports.iataCode, flights.originIata))
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt));

    // Fetch all distinct destination cities in one query
    const destIatas = [...new Set(rows.map((r) => r.destinationIata))];
    const destRows =
      destIatas.length > 0
        ? await this.db
            .select({ iataCode: airports.iataCode, city: airports.city })
            .from(airports)
            .where(eq(airports.iataCode, destIatas[0]!))
        : [];

    // For multiple destinations use a broader select then filter in memory
    const allDestRows =
      destIatas.length > 0
        ? await this.db
            .select({ iataCode: airports.iataCode, city: airports.city })
            .from(airports)
        : [];

    const destCityMap = new Map(allDestRows.map((r) => [r.iataCode, r.city]));
    void destRows;

    // Group by booking
    const bookingMap = new Map<string, BookingHistoryEntry>();
    for (const row of rows) {
      if (!bookingMap.has(row.bookingId)) {
        bookingMap.set(row.bookingId, {
          id: row.bookingId,
          reference: row.reference,
          status: row.status,
          totalPricePence: row.totalPricePence,
          createdAt: row.createdAt,
          segments: [],
        });
      }
      const segment: FlightHistorySegment = {
        flightId: row.flightId,
        flightNumber: row.flightNumber,
        originIata: row.originIata,
        originCity: row.originCity,
        destinationIata: row.destinationIata,
        destinationCity: destCityMap.get(row.destinationIata) ?? row.destinationIata,
        departureAt: row.departureAt,
        arrivalAt: row.arrivalAt,
        seatClass: row.seatClass,
        farePaidPence: row.farePaidPence,
      };
      bookingMap.get(row.bookingId)!.segments.push(segment);
    }

    return [...bookingMap.values()];
  }

  async findAllForFlight(flightId: string): Promise<Booking[]> {
    const segRows = await this.db
      .select()
      .from(bookingSegments)
      .where(eq(bookingSegments.flightId, flightId));

    const bookingIds = [...new Set(segRows.map((s) => s.bookingId))];
    if (bookingIds.length === 0) return [];

    return Promise.all(
      bookingIds.map(async (bid) => {
        const b = await this.findById(bid);
        return b!;
      }),
    );
  }

  private async findWith(
    condition: Parameters<typeof this.db.select>[0] extends undefined
      ? never
      : ReturnType<typeof eq>,
  ): Promise<Booking | null> {
    const [row] = await this.db.select().from(bookings).where(condition).limit(1);
    if (!row) return null;
    return this.loadRelations(row);
  }

  private async loadRelations(row: typeof bookings.$inferSelect): Promise<Booking> {
    const [segs, paxs] = await Promise.all([
      this.db.select().from(bookingSegments).where(eq(bookingSegments.bookingId, row.id)),
      this.db.select().from(bookingPassengers).where(eq(bookingPassengers.bookingId, row.id)),
    ]);
    return this.toBooking(row, segs, paxs);
  }

  private toBooking(
    row: typeof bookings.$inferSelect,
    segs: (typeof bookingSegments.$inferSelect)[],
    paxs: (typeof bookingPassengers.$inferSelect)[],
  ): Booking {
    const segments: BookingSegment[] = segs.map((s) => ({
      id: s.id,
      flightId: s.flightId,
      seatClass: s.seatClass,
      farePaidPence: s.farePaidPence,
    }));

    const passengers: BookingPassenger[] = paxs.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      documentType: p.documentType,
      documentNumber: p.documentNumber,
    }));

    return {
      id: row.id,
      reference: row.reference,
      userId: row.userId ?? null,
      status: row.status,
      totalPricePence: row.totalPricePence,
      segments,
      passengers,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
