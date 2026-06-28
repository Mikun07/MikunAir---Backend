import type { IFlightRepository, Flight, FlightSearchParams, ConnectingFlightPair, SeatClass } from './types.js';
import { FlightNotFoundError, NoSeatsAvailableError } from '../../../shared/errors/index.js';

export class FlightAvailabilityService {
  constructor(private readonly flightRepository: IFlightRepository) {}

  async searchFlights(params: FlightSearchParams): Promise<Flight[]> {
    return this.flightRepository.findAvailable(params);
  }

  async searchConnectingFlights(params: FlightSearchParams): Promise<ConnectingFlightPair[]> {
    return this.flightRepository.findConnecting(params);
  }

  async getFlightOrThrow(id: string): Promise<Flight> {
    const flight = await this.flightRepository.findById(id);
    if (!flight) throw new FlightNotFoundError(id);
    return flight;
  }

  assertSeatsAvailable(flight: Flight, seatClass: SeatClass, count: number): void {
    const available =
      seatClass === 'ECONOMY' ? flight.economySeatsAvailable : flight.businessSeatsAvailable;

    if (available < count) throw new NoSeatsAvailableError();
  }
}
