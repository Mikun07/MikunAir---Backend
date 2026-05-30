import nodemailer from 'nodemailer';
import { logger } from '../../shared/logger/index.js';
import type { BookingConfirmedEvent, BookingCancelledEvent } from '../../shared/events/index.js';

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function createTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: process.env['SMTP_HOST'] ?? 'localhost',
    port: Number.parseInt(process.env['SMTP_PORT'] ?? '1025', 10),
    secure: process.env['NODE_ENV'] === 'production',
    auth:
      process.env['SMTP_USER']
        ? {
            user: process.env['SMTP_USER'],
            pass: process.env['SMTP_PASS'],
          }
        : undefined,
  });
}

export class NotificationService {
  private readonly transport: nodemailer.Transporter;

  constructor() {
    this.transport = createTransport();
  }

  async sendBookingConfirmation(event: BookingConfirmedEvent): Promise<void> {
    try {
      await this.transport.sendMail({
        from: `"MikunAir" <noreply@mikunair.com>`,
        to: event.passengerEmails,
        subject: `Booking Confirmed — ${event.bookingReference}`,
        text: [
          `Your booking has been confirmed.`,
          ``,
          `Reference: ${event.bookingReference}`,
          `Total: ${formatPrice(event.totalPricePence)}`,
          ``,
          `Thank you for booking with MikunAir.`,
        ].join('\n'),
      });

      logger.info('Booking confirmation email sent', {
        bookingId: event.bookingId,
        reference: event.bookingReference,
      });
    } catch (err) {
      logger.error('Failed to send booking confirmation email', {
        bookingId: event.bookingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  sendBookingCancellation(event: BookingCancelledEvent): void {
    logger.info('Booking cancelled — notification logged', {
      bookingId: event.bookingId,
      reference: event.bookingReference,
    });
  }
}
