export type FlightStatus = 'SCHEDULED' | 'CANCELLED' | 'DEPARTED';
export type SeatClass = 'ECONOMY' | 'BUSINESS';

export interface Airport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface Flight {
  id: string;
  flightNumber: string;
  origin: Airport;
  destination: Airport;
  departureAt: Date;
  arrivalAt: Date;
  economySeatsTotal: number;
  economySeatsAvailable: number;
  businessSeatsTotal: number;
  businessSeatsAvailable: number;
  economyFarePence: number;
  businessFarePence: number;
  status: FlightStatus;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: number;
  seatClass?: SeatClass;
}

export interface CreateFlightDTO {
  flightNumber: string;
  originIata: string;
  destinationIata: string;
  departureAt: Date;
  arrivalAt: Date;
  economySeatsTotal: number;
  businessSeatsTotal: number;
  economyFarePence: number;
  businessFarePence: number;
}

export interface UpdateFlightDTO {
  flightNumber?: string;
  departureAt?: Date;
  arrivalAt?: Date;
  economyFarePence?: number;
  businessFarePence?: number;
  status?: FlightStatus;
}

export interface ConnectingFlightPair {
  leg1: Flight;
  leg2: Flight;
  layoverMinutes: number;
}

export interface IFlightRepository {
  findAvailable(params: FlightSearchParams): Promise<Flight[]>;
  findConnecting(params: FlightSearchParams): Promise<ConnectingFlightPair[]>;
  findById(id: string): Promise<Flight | null>;
  decrementSeatCount(
    flightId: string,
    seatClass: SeatClass,
    count: number,
  ): Promise<void>;
  create(dto: CreateFlightDTO): Promise<Flight>;
  update(id: string, dto: UpdateFlightDTO): Promise<Flight>;
  deactivate(id: string): Promise<void>;
}
