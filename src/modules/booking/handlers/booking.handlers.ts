import type { Request, Response, NextFunction } from 'express';
import { CreateBookingSchema } from '../../../shared/validation/index.js';
import type { BookingService } from '../domain/booking.service.js';

export class BookingHandlers {
  constructor(private readonly bookingService: BookingService) {}

  createBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = CreateBookingSchema.parse(req.body);
      const result = await this.bookingService.createBooking({
        ...dto,
        userId: req.user?.sub,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  getMyBookings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const bookings = await this.bookingService.getBookingHistory(userId);
      res.status(200).json(bookings);
    } catch (err) {
      next(err);
    }
  };

  getBookingByReference = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reference } = req.params as { reference: string };
      const booking = await this.bookingService.getBookingByReference(
        reference,
        req.user?.sub,
      );
      res.status(200).json(booking);
    } catch (err) {
      next(err);
    }
  };

  getFlightHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const history = await this.bookingService.getFlightHistory(userId);
      res.status(200).json(history);
    } catch (err) {
      next(err);
    }
  };

  cancelBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reference } = req.params as { reference: string };
      const userId = req.user!.sub;
      const booking = await this.bookingService.getBookingByReference(reference, userId);
      await this.bookingService.cancelBooking(booking.id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
