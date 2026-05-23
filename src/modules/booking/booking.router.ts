import { Router, type RequestHandler } from 'express';
import { authenticate, optionalAuthenticate } from '../../shared/auth/index.js';
import type { BookingHandlers } from './handlers/booking.handlers.js';

export function createBookingRouter(handlers: BookingHandlers): Router {
  const router = Router();

  router.post('/', optionalAuthenticate, handlers.createBooking as RequestHandler);
  router.get('/', authenticate, handlers.getMyBookings as RequestHandler);
  router.get('/:reference', optionalAuthenticate, handlers.getBookingByReference as RequestHandler);
  router.post('/:id/cancel', authenticate, handlers.cancelBooking as RequestHandler);

  return router;
}
