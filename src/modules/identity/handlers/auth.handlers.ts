import type { Request, Response, NextFunction } from 'express';
import { RegisterSchema, LoginSchema } from '../../../shared/validation/index.js';
import { verifyRefreshToken } from '../../../shared/auth/index.js';
import { UnauthorisedError } from '../../../shared/errors/index.js';
import type { IdentityService } from '../domain/identity.service.js';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export class AuthHandlers {
  constructor(private readonly identityService: IdentityService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, consentGiven } = RegisterSchema.parse(req.body);
      const { accessToken, refreshToken, user } = await this.identityService.register(
        email,
        password,
        consentGiven,
      );

      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
      res.status(201).json({ accessToken, user });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = LoginSchema.parse(req.body);
      const { accessToken, refreshToken, user } = await this.identityService.login(
        email,
        password,
      );

      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
      res.status(200).json({ accessToken, user });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.cookies[REFRESH_COOKIE] as string | undefined;
      if (!token) {
        next(new UnauthorisedError('No refresh token provided.'));
        return;
      }

      const { sub: userId } = verifyRefreshToken(token);
      const { accessToken, refreshToken, user } = await this.identityService.refreshTokens(userId);

      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
      res.status(200).json({ accessToken, user });
    } catch {
      next(new UnauthorisedError('Invalid or expired refresh token.'));
    }
  };

  logout = (_req: Request, res: Response): void => {
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).end();
  };

  requestErasure = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      await this.identityService.requestErasure(userId);
      res.clearCookie(REFRESH_COOKIE);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
