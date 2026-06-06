import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { IdentityService } from './identity.service.js';
import { ConflictError, InvalidCredentialsError } from '../../../shared/errors/index.js';
import type { IUserRepository, User } from './types.js';

// JWT functions require secrets — set them before any import resolves
beforeAll(() => {
  process.env['JWT_SECRET'] = 'test-access-secret';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
});

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$placeholder',
    role: 'USER',
    consentGivenAt: new Date('2026-01-01T00:00:00Z'),
    consentWithdrawnAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    create: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    anonymise: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('IdentityService', () => {
  let repo: IUserRepository;
  let service: IdentityService;

  beforeEach(() => {
    repo = makeRepo();
    service = new IdentityService(repo);
  });

  describe('register', () => {
    it('throws ConflictError when email already exists', async () => {
      vi.mocked(repo.findByEmail).mockResolvedValue(makeUser());
      await expect(service.register('test@example.com', 'Password1!', true)).rejects.toThrow(ConflictError);
    });

    it('creates a new user and returns tokens', async () => {
      const user = makeUser();
      vi.mocked(repo.create).mockResolvedValue(user);

      const result = await service.register('test@example.com', 'Password1!', true);

      expect(repo.create).toHaveBeenCalledOnce();
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('test@example.com');
    });

    it('hashes the password before storing', async () => {
      const user = makeUser();
      vi.mocked(repo.create).mockResolvedValue(user);

      await service.register('test@example.com', 'Password1!', true);

      const createCall = vi.mocked(repo.create).mock.calls[0][0];
      expect(createCall.passwordHash).not.toBe('Password1!');
      expect(createCall.passwordHash).toMatch(/^\$2b\$/);
    });

    it('records consentGivenAt timestamp', async () => {
      const user = makeUser();
      vi.mocked(repo.create).mockResolvedValue(user);

      await service.register('test@example.com', 'Password1!', true);

      const createCall = vi.mocked(repo.create).mock.calls[0][0];
      expect(createCall.consentGivenAt).toBeInstanceOf(Date);
    });

    it('returns a UserPublicDTO without passwordHash', async () => {
      const user = makeUser();
      vi.mocked(repo.create).mockResolvedValue(user);

      const result = await service.register('test@example.com', 'Password1!', true);

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('role');
      expect(result.user).toHaveProperty('createdAt');
    });
  });

  describe('login', () => {
    it('throws InvalidCredentialsError when user is not found', async () => {
      await expect(service.login('unknown@example.com', 'any')).rejects.toThrow(InvalidCredentialsError);
    });

    it('throws InvalidCredentialsError when password is wrong', async () => {
      // Store a real bcrypt hash for "CorrectPassword1!"
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash('CorrectPassword1!', 4);
      vi.mocked(repo.findByEmail).mockResolvedValue(makeUser({ passwordHash: hash }));

      await expect(service.login('test@example.com', 'WrongPassword!')).rejects.toThrow(InvalidCredentialsError);
    });

    it('returns tokens on successful login', async () => {
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash('Password1!', 4);
      const user = makeUser({ passwordHash: hash });
      vi.mocked(repo.findByEmail).mockResolvedValue(user);

      const result = await service.login('test@example.com', 'Password1!');

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.id).toBe('user-1');
    });
  });

  describe('refreshTokens', () => {
    it('throws InvalidCredentialsError when user not found', async () => {
      await expect(service.refreshTokens('missing-id')).rejects.toThrow(InvalidCredentialsError);
    });

    it('returns fresh tokens for a valid user', async () => {
      const user = makeUser();
      vi.mocked(repo.findById).mockResolvedValue(user);

      const result = await service.refreshTokens('user-1');

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });
  });

  describe('requestErasure', () => {
    it('throws InvalidCredentialsError when user not found', async () => {
      await expect(service.requestErasure('missing-id')).rejects.toThrow(InvalidCredentialsError);
    });

    it('calls anonymise on the repository for a valid user', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeUser());

      await service.requestErasure('user-1');

      expect(repo.anonymise).toHaveBeenCalledWith('user-1');
    });
  });
});
