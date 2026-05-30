export interface PassengerProfile {
  id: string;
  userId: string;
  fullName: string;
  dateOfBirth: string;
  documentType: 'PASSPORT' | 'ID_CARD';
  documentNumber: string;
  isAnonymised: boolean;
  createdAt: Date;
}

export interface CreatePassengerProfileDTO {
  userId: string;
  fullName: string;
  dateOfBirth: string;
  documentType: 'PASSPORT' | 'ID_CARD';
  documentNumber: string;
}

export interface IPassengerRepository {
  create(dto: CreatePassengerProfileDTO): Promise<PassengerProfile>;
  findByUserId(userId: string): Promise<PassengerProfile[]>;
  findById(id: string): Promise<PassengerProfile | null>;
  delete(id: string, userId: string): Promise<void>;
  anonymiseByUserId(userId: string): Promise<void>;
}
