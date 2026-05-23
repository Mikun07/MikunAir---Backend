import type { SeatClass } from '../../flight/domain/types.js';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface BookingPassenger {
  id: string;
  fullName: string;
  dateOfBirth: string;
  documentType: 'PASSPORT' | 'ID_CARD';
  documentNumber: string;
}

export interface BookingSegment {
  id: string;
  flightId: string;
  seatClass: SeatClass;
  farePaidPence: number;
}

export interface Booking {
  id: string;
  reference: string;
  userId: string | null;
  status: BookingStatus;
  totalPricePence: number;
  segments: BookingSegment[];
  passengers: BookingPassenger[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookingDTO {
  outboundFlightId: string;
  inboundFlightId?: string;
  seatClass: SeatClass;
  passengers: {
    fullName: string;
    dateOfBirth: string;
    documentType: 'PASSPORT' | 'ID_CARD';
    documentNumber: string;
  }[];
  userId?: string;
}

export interface BookingConfirmation {
  bookingId: string;
  reference: string;
  status: BookingStatus;
  totalPricePence: number;
}

export interface IBookingRepository {
  create(dto: CreateBookingDTO & { reference: string; totalPricePence: number }): Promise<Booking>;
  findById(id: string): Promise<Booking | null>;
  findByReference(reference: string): Promise<Booking | null>;
  findByUserId(userId: string): Promise<Booking[]>;
  updateStatus(id: string, status: BookingStatus): Promise<void>;
  findAllForFlight(flightId: string): Promise<Booking[]>;
}
