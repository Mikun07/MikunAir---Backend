import { FlightSearchParamsSchema } from '../shared/validation/index.js';
import type { FlightAvailabilityService } from '../modules/flight/domain/flight-availability.service.js';
import type { Flight } from '../modules/flight/domain/types.js';

const TAX_RATE = 0.12;

interface SearchFlightsArgs {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  returnDate?: string;
  seatClass?: 'ECONOMY' | 'BUSINESS';
}

interface GqlAirport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
}

interface GqlFare {
  baseFarePence: number;
  taxesPence: number;
  totalPence: number;
  currency: string;
}

interface GqlFlightOption {
  id: string;
  flightNumber: string;
  origin: GqlAirport;
  destination: GqlAirport;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: number;
  availableSeats: number;
  farePerPassenger: GqlFare;
}

interface GqlConnectingFlightOption {
  leg1: GqlFlightOption;
  leg2: GqlFlightOption;
  layoverMinutes: number;
  totalDurationMinutes: number;
  totalFarePerPassenger: GqlFare;
}

interface GqlSearchResult {
  outbound: GqlFlightOption[];
  inbound: GqlFlightOption[] | null;
  connectingOutbound: GqlConnectingFlightOption[];
  connectingInbound: GqlConnectingFlightOption[] | null;
}

function buildFare(totalPence: number): GqlFare {
  const taxesPence = Math.round(totalPence * TAX_RATE);
  return { baseFarePence: totalPence - taxesPence, taxesPence, totalPence, currency: 'GBP' };
}

function toGqlAirport(a: Flight['origin']): GqlAirport {
  return { iataCode: a.iataCode, name: a.name, city: a.city, country: a.country };
}

function toFlightOption(flight: Flight, seatClass: 'ECONOMY' | 'BUSINESS'): GqlFlightOption {
  const durationMinutes = Math.round(
    (flight.arrivalAt.getTime() - flight.departureAt.getTime()) / 60_000,
  );
  const totalPence = seatClass === 'BUSINESS' ? flight.businessFarePence : flight.economyFarePence;
  const availableSeats =
    seatClass === 'BUSINESS' ? flight.businessSeatsAvailable : flight.economySeatsAvailable;

  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    origin: toGqlAirport(flight.origin),
    destination: toGqlAirport(flight.destination),
    departureAt: flight.departureAt.toISOString(),
    arrivalAt: flight.arrivalAt.toISOString(),
    durationMinutes,
    stops: 0,
    availableSeats,
    farePerPassenger: buildFare(totalPence),
  };
}

export function createResolvers(flightService: FlightAvailabilityService): {
  Query: { searchFlights: (args: SearchFlightsArgs) => Promise<GqlSearchResult> };
} {
  return {
    Query: {
      searchFlights: async (args: SearchFlightsArgs): Promise<GqlSearchResult> => {
        const params = FlightSearchParamsSchema.parse(args);
        const seatClass = params.seatClass ?? 'ECONOMY';

        const [outboundFlights, connectingOutboundPairs] = await Promise.all([
          flightService.searchFlights({
            origin: params.origin,
            destination: params.destination,
            departureDate: params.departureDate,
            passengers: params.passengers,
            seatClass,
          }),
          flightService.searchConnectingFlights({
            origin: params.origin,
            destination: params.destination,
            departureDate: params.departureDate,
            passengers: params.passengers,
            seatClass,
          }),
        ]);

        let inboundFlights = null;
        let connectingInboundPairs = null;

        if (params.returnDate) {
          [inboundFlights, connectingInboundPairs] = await Promise.all([
            flightService.searchFlights({
              origin: params.destination,
              destination: params.origin,
              departureDate: params.returnDate,
              passengers: params.passengers,
              seatClass,
            }),
            flightService.searchConnectingFlights({
              origin: params.destination,
              destination: params.origin,
              departureDate: params.returnDate,
              passengers: params.passengers,
              seatClass,
            }),
          ]);
        }

        const toConnecting = (pair: (typeof connectingOutboundPairs)[number]): GqlConnectingFlightOption => {
          const l1 = toFlightOption(pair.leg1, seatClass);
          const l2 = toFlightOption(pair.leg2, seatClass);
          const totalDurationMinutes =
            Math.round((pair.leg2.arrivalAt.getTime() - pair.leg1.departureAt.getTime()) / 60_000);
          const totalPence = l1.farePerPassenger.totalPence + l2.farePerPassenger.totalPence;
          return {
            leg1: l1,
            leg2: l2,
            layoverMinutes: pair.layoverMinutes,
            totalDurationMinutes,
            totalFarePerPassenger: buildFare(totalPence),
          };
        };

        return {
          outbound: outboundFlights.map((f) => toFlightOption(f, seatClass)),
          inbound: inboundFlights?.map((f) => toFlightOption(f, seatClass)) ?? null,
          connectingOutbound: connectingOutboundPairs.map(toConnecting),
          connectingInbound: connectingInboundPairs?.map(toConnecting) ?? null,
        };
      },
    },
  };
}
