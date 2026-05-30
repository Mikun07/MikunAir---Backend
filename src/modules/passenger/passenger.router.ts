import { Router, type RequestHandler } from 'express';
import { authenticate } from '../../shared/auth/index.js';
import type { PassengerHandlers } from './handlers/passenger.handlers.js';

export function createPassengerRouter(handlers: PassengerHandlers): Router {
  const router = Router();

  router.get('/', authenticate, handlers.getProfiles as RequestHandler);
  router.post('/', authenticate, handlers.saveProfile as RequestHandler);
  router.delete('/:id', authenticate, handlers.deleteProfile as RequestHandler);

  return router;
}
