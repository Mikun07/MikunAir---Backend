import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole } from '../../shared/auth/index.js';
import type { AdminHandlers } from './handlers/admin.handlers.js';

export function createAdminRouter(handlers: AdminHandlers): Router {
  const router = Router();

  router.use(authenticate, requireRole('ADMIN'));

  router.get('/flights', handlers.listFlights as RequestHandler);
  router.post('/flights', handlers.createFlight as RequestHandler);
  router.patch('/flights/:id', handlers.updateFlight as RequestHandler);
  router.delete('/flights/:id', handlers.deactivateFlight as RequestHandler);

  return router;
}
