import type { UserRole } from '../../../shared/auth/index.js';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  consentGivenAt: Date;
  consentWithdrawnAt: Date | null;
  createdAt: Date;
}

export interface CreateUserDTO {
  email: string;
  passwordHash: string;
  consentGivenAt: Date;
}

export interface UserPublicDTO {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface IUserRepository {
  create(dto: CreateUserDTO): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  anonymise(userId: string): Promise<void>;
}
