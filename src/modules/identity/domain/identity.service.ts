import bcrypt from 'bcrypt';
import {
  signAccessToken,
  signRefreshToken,
} from '../../../shared/auth/index.js';
import {
  InvalidCredentialsError,
  ConflictError,
} from '../../../shared/errors/index.js';
import type { IUserRepository, User, UserPublicDTO } from './types.js';

const BCRYPT_COST = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserPublicDTO;
}

export class IdentityService {
  constructor(private readonly userRepository: IUserRepository) {}

  async register(email: string, password: string, _consentGiven: true): Promise<AuthTokens> {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('An account with this email address already exists.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await this.userRepository.create({
      email,
      passwordHash,
      consentGivenAt: new Date(),
    });

    return this.buildTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new InvalidCredentialsError();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new InvalidCredentialsError();

    return this.buildTokens(user);
  }

  async refreshTokens(userId: string): Promise<AuthTokens> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();
    return this.buildTokens(user);
  }

  async requestErasure(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new InvalidCredentialsError();
    await this.userRepository.anonymise(userId);
  }

  private buildTokens(user: User): AuthTokens {
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = signRefreshToken(user.id);

    const userDto: UserPublicDTO = {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    return { accessToken, refreshToken, user: userDto };
  }
}
