import { eq, and, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/index.js';
import { flights, airports } from '../../../shared/database/index.js';
import { FlightNotFoundError } from '../../../shared/errors/index.js';
import type {
  IFlightRepository,
  Flight,
  Airport,
  FlightSearchParams,
  CreateFlightDTO,
  UpdateFlightDTO,
  SeatClass,
} from '../domain/types.js';

export class PostgresFlightRepository implements IFlightRepository {
  constructor(private readonly db: Db) {}

  async findAvailable(params: FlightSearchParams): Promise<Flight[]> {
    const departure = new Date(params.departureDate);
    const nextDay = new Date(departure);
    nextDay.setDate(nextDay.getDate() + 1);

    const seatFilter =
      params.seatClass === 'BUSINESS'
        ? sql`${flights.businessSeatsAvailable} >= ${params.passengers}`
        : sql`${flights.economySeatsAvailable} >= ${params.passengers}`;

    const rows = await this.db
      .select({
        flight: flights,
        origin: airports,
      })
      .from(flights)
      .innerJoin(airports, eq(flights.originIata, airports.iataCode))
      .where(
        and(
          eq(flights.originIata, params.origin),
          eq(flights.destinationIata, params.destination),
          eq(flights.status, 'SCHEDULED'),
          gte(flights.departureAt, departure),
          lt(flights.departureAt, nextDay),
          seatFilter,
        ),
      )
      .orderBy(flights.departureAt);

    // Fetch destination airports separately to avoid ambiguous join alias
    const destRows = await this.db
      .select()
      .from(airports)
      .where(eq(airports.iataCode, params.destination))
      .limit(1);

    const destAirport = destRows[0];
    if (!destAirport) return [];

    return rows.map((r) => this.toFlight(r.flight, r.origin, destAirport));
  }

  async findById(id: string): Promise<Flight | null> {
    const [row] = await this.db
      .select({ flight: flights, origin: airports })
      .from(flights)
      .innerJoin(airports, eq(flights.originIata, airports.iataCode))
      .where(eq(flights.id, id))
      .limit(1);

    if (!row) return null;

    const [dest] = await this.db
      .select()
      .from(airports)
      .where(eq(airports.iataCode, row.flight.destinationIata))
      .limit(1);

    if (!dest) return null;
    return this.toFlight(row.flight, row.origin, dest);
  }

  async decrementSeatCount(flightId: string, seatClass: SeatClass, count: number): Promise<void> {
    const column =
      seatClass === 'ECONOMY' ? flights.economySeatsAvailable : flights.businessSeatsAvailable;

    await this.db
      .update(flights)
      .set({ [column.name]: sql`${column} - ${count}`, updatedAt: new Date() })
      .where(and(eq(flights.id, flightId), sql`${column} >= ${count}`));
  }

  async create(dto: CreateFlightDTO): Promise<Flight> {
    const [row] = await this.db
      .insert(flights)
      .values({
        flightNumber: dto.flightNumber,
        originIata: dto.originIata,
        destinationIata: dto.destinationIata,
        departureAt: dto.departureAt,
        arrivalAt: dto.arrivalAt,
        economySeatsTotal: dto.economySeatsTotal,
        economySeatsAvailable: dto.economySeatsTotal,
        businessSeatsTotal: dto.businessSeatsTotal,
        businessSeatsAvailable: dto.businessSeatsTotal,
        economyFarePence: dto.economyFarePence,
        businessFarePence: dto.businessFarePence,
      })
      .returning();

    if (!row) throw new Error('Flight insert returned no rows');

    const [origin] = await this.db
      .select()
      .from(airports)
      .where(eq(airports.iataCode, dto.originIata))
      .limit(1);
    const [destination] = await this.db
      .select()
      .from(airports)
      .where(eq(airports.iataCode, dto.destinationIata))
      .limit(1);

    if (!origin || !destination) throw new FlightNotFoundError();
    return this.toFlight(row, origin, destination);
  }

  async update(id: string, dto: UpdateFlightDTO): Promise<Flight> {
    const updateValues: Partial<typeof flights.$inferInsert> = {};
    if (dto.flightNumber !== undefined) updateValues.flightNumber = dto.flightNumber;
    if (dto.departureAt !== undefined) updateValues.departureAt = dto.departureAt;
    if (dto.arrivalAt !== undefined) updateValues.arrivalAt = dto.arrivalAt;
    if (dto.economyFarePence !== undefined) updateValues.economyFarePence = dto.economyFarePence;
    if (dto.businessFarePence !== undefined) updateValues.businessFarePence = dto.businessFarePence;
    if (dto.status !== undefined) updateValues.status = dto.status;
    updateValues.updatedAt = new Date();

    await this.db.update(flights).set(updateValues).where(eq(flights.id, id));

    const flight = await this.findById(id);
    if (!flight) throw new FlightNotFoundError(id);
    return flight;
  }

  async deactivate(id: string): Promise<void> {
    await this.db
      .update(flights)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(flights.id, id));
  }

  private toFlight(
    row: typeof flights.$inferSelect,
    origin: typeof airports.$inferSelect,
    destination: typeof airports.$inferSelect,
  ): Flight {
    return {
      id: row.id,
      flightNumber: row.flightNumber,
      origin: this.toAirport(origin),
      destination: this.toAirport(destination),
      departureAt: row.departureAt,
      arrivalAt: row.arrivalAt,
      economySeatsTotal: row.economySeatsTotal,
      economySeatsAvailable: row.economySeatsAvailable,
      businessSeatsTotal: row.businessSeatsTotal,
      businessSeatsAvailable: row.businessSeatsAvailable,
      economyFarePence: row.economyFarePence,
      businessFarePence: row.businessFarePence,
      status: row.status,
    };
  }

  private toAirport(row: typeof airports.$inferSelect): Airport {
    return {
      iataCode: row.iataCode,
      name: row.name,
      city: row.city,
      country: row.country,
      timezone: row.timezone,
    };
  }
}
