import { FlightSearchParamsSchema } from '../shared/validation/index.js';
import type { FlightAvailabilityService } from '../modules/flight/domain/flight-availability.service.js';
import type { Flight } from '../modules/flight/domain/types.js';

const TAX_RATE = 0.12; // 12% tax included in all displayed fares

interface SearchFlightsArgs {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  returnDate?: string;
  seatClass?: 'ECONOMY' | 'BUSINESS';
}

interface FlightOption {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: number;
  availableSeats: number;
  farePerPassenger: { baseFarePence: number; taxesPence: number; totalPence: number; currency: string };
}

function toFlightOption(flight: Flight, seatClass: 'ECONOMY' | 'BUSINESS' = 'ECONOMY'): FlightOption {
  const durationMinutes = Math.round(
    (flight.arrivalAt.getTime() - flight.departureAt.getTime()) / 60_000,
  );
  const totalPence =
    seatClass === 'BUSINESS' ? flight.businessFarePence : flight.economyFarePence;
  const taxesPence = Math.round(totalPence * TAX_RATE);
  const baseFarePence = totalPence - taxesPence;
  const availableSeats =
    seatClass === 'BUSINESS' ? flight.businessSeatsAvailable : flight.economySeatsAvailable;

  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    origin: flight.origin.iataCode,
    destination: flight.destination.iataCode,
    departureAt: flight.departureAt.toISOString(),
    arrivalAt: flight.arrivalAt.toISOString(),
    durationMinutes,
    stops: 0,
    availableSeats,
    farePerPassenger: {
      baseFarePence,
      taxesPence,
      totalPence,
      currency: 'GBP',
    },
  };
}

interface SearchFlightsResult {
  outbound: FlightOption[];
  inbound: FlightOption[] | null;
}

export function createResolvers(flightService: FlightAvailabilityService): { Query: { searchFlights: (args: SearchFlightsArgs) => Promise<SearchFlightsResult> } } {
  return {
    Query: {
      searchFlights: async (args: SearchFlightsArgs): Promise<SearchFlightsResult> => {
        const params = FlightSearchParamsSchema.parse(args);
        const seatClass = params.seatClass ?? 'ECONOMY';

        const outboundFlights = await flightService.searchFlights({
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
          passengers: params.passengers,
          seatClass,
        });

        let inboundFlights: Flight[] | null = null;
        if (params.returnDate) {
          inboundFlights = await flightService.searchFlights({
            origin: params.destination,
            destination: params.origin,
            departureDate: params.returnDate,
            passengers: params.passengers,
            seatClass,
          });
        }

        return {
          outbound: outboundFlights.map((f) => toFlightOption(f, seatClass)),
          inbound: inboundFlights?.map((f) => toFlightOption(f, seatClass)) ?? null,
        };
      },
    },
  };
}
