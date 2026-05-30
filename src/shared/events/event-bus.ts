import { EventEmitter } from 'node:events';

export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

export interface BookingConfirmedEvent extends DomainEvent {
  readonly type: 'booking.confirmed';
  readonly bookingId: string;
  readonly bookingReference: string;
  readonly userId: string | null;
  readonly passengerEmails: string[];
  readonly totalPricePence: number;
}

export interface BookingCancelledEvent extends DomainEvent {
  readonly type: 'booking.cancelled';
  readonly bookingId: string;
  readonly bookingReference: string;
  readonly userId: string | null;
}

export type AppEvent = BookingConfirmedEvent | BookingCancelledEvent;

class EventBus extends EventEmitter {
  publish(event: AppEvent): void {
    this.emit(event.type, event);
  }

  subscribe<T extends AppEvent>(
    eventType: T['type'],
    handler: (event: T) => void | Promise<void>,
  ): void {
    this.on(eventType, (event: T) => {
      void Promise.resolve(handler(event)).catch((err: unknown) => {
        process.stderr.write(
          `EventBus handler error for ${eventType}: ${String(err)}\n`,
        );
      });
    });
  }
}

// Singleton event bus for the process lifetime
export const eventBus = new EventBus();
eventBus.setMaxListeners(20);
