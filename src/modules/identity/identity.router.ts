import { Router, type RequestHandler } from 'express';
import { authenticate } from '../../shared/auth/index.js';
import type { AuthHandlers } from './handlers/auth.handlers.js';

export function createIdentityRouter(handlers: AuthHandlers): Router {
  const router = Router();

  router.post('/auth/register', handlers.register as RequestHandler);
  router.post('/auth/login', handlers.login as RequestHandler);
  router.post('/auth/refresh', handlers.refresh as RequestHandler);
  router.post('/auth/logout', authenticate, handlers.logout as RequestHandler);
  router.post('/users/me/erasure', authenticate, handlers.requestErasure as RequestHandler);

  return router;
}
