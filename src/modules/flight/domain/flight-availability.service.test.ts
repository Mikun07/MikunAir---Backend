import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlightAvailabilityService } from './flight-availability.service.js';
import { FlightNotFoundError, NoSeatsAvailableError } from '../../../shared/errors/index.js';
import type { IFlightRepository, Flight } from './types.js';

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
    businessSeatsAvailable: 2,
    economyFarePence: 8500,
    businessFarePence: 32000,
    status: 'SCHEDULED',
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IFlightRepository> = {}): IFlightRepository {
  return {
    findAvailable: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    decrementSeatCount: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    ...overrides,
  };
}

describe('FlightAvailabilityService', () => {
  let repo: IFlightRepository;
  let service: FlightAvailabilityService;

  beforeEach(() => {
    repo = makeRepo();
    service = new FlightAvailabilityService(repo);
  });

  describe('searchFlights', () => {
    it('delegates to repository and returns results', async () => {
      const flight = makeFlight();
      vi.mocked(repo.findAvailable).mockResolvedValue([flight]);

      const params = { origin: 'LHR', destination: 'ARN', departureDate: '2026-07-01', passengers: 1 };
      const results = await service.searchFlights(params);

      expect(repo.findAvailable).toHaveBeenCalledWith(params);
      expect(results).toEqual([flight]);
    });

    it('returns empty array when no flights match', async () => {
      const results = await service.searchFlights({
        origin: 'LHR', destination: 'ARN', departureDate: '2026-07-01', passengers: 1,
      });
      expect(results).toEqual([]);
    });
  });

  describe('getFlightOrThrow', () => {
    it('returns the flight when found', async () => {
      const flight = makeFlight();
      vi.mocked(repo.findById).mockResolvedValue(flight);

      const result = await service.getFlightOrThrow('flight-1');
      expect(result).toEqual(flight);
    });

    it('throws FlightNotFoundError when flight does not exist', async () => {
      await expect(service.getFlightOrThrow('missing-id')).rejects.toThrow(FlightNotFoundError);
    });

    it('includes the flight id in the error message', async () => {
      await expect(service.getFlightOrThrow('missing-id')).rejects.toThrow('missing-id');
    });
  });

  describe('assertSeatsAvailable', () => {
    it('does not throw when economy seats are sufficient', () => {
      const flight = makeFlight({ economySeatsAvailable: 5 });
      expect(() => service.assertSeatsAvailable(flight, 'ECONOMY', 5)).not.toThrow();
    });

    it('does not throw when business seats are sufficient', () => {
      const flight = makeFlight({ businessSeatsAvailable: 2 });
      expect(() => service.assertSeatsAvailable(flight, 'BUSINESS', 2)).not.toThrow();
    });

    it('throws NoSeatsAvailableError when economy seats are insufficient', () => {
      const flight = makeFlight({ economySeatsAvailable: 2 });
      expect(() => service.assertSeatsAvailable(flight, 'ECONOMY', 3)).toThrow(NoSeatsAvailableError);
    });

    it('throws NoSeatsAvailableError when business seats are insufficient', () => {
      const flight = makeFlight({ businessSeatsAvailable: 0 });
      expect(() => service.assertSeatsAvailable(flight, 'BUSINESS', 1)).toThrow(NoSeatsAvailableError);
    });

    it('throws NoSeatsAvailableError when exactly one seat short', () => {
      const flight = makeFlight({ economySeatsAvailable: 4 });
      expect(() => service.assertSeatsAvailable(flight, 'ECONOMY', 5)).toThrow(NoSeatsAvailableError);
    });

    it('does not throw when requesting exactly the available count', () => {
      const flight = makeFlight({ economySeatsAvailable: 3 });
      expect(() => service.assertSeatsAvailable(flight, 'ECONOMY', 3)).not.toThrow();
    });
  });
});
