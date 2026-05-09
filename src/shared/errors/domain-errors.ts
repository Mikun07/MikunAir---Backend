export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain for instanceof checks after transpilation
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FlightNotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code = 'FLIGHT_NOT_FOUND';

  constructor(id?: string) {
    super(id ? `Flight not found: ${id}` : 'Flight not found.');
  }
}

export class NoSeatsAvailableError extends DomainError {
  readonly statusCode = 409;
  readonly code = 'NO_SEATS_AVAILABLE';

  constructor() {
    super('No seats available for this flight.');
  }
}

export class BookingNotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code = 'BOOKING_NOT_FOUND';

  constructor(ref?: string) {
    super(ref ? `Booking not found: ${ref}` : 'Booking not found.');
  }
}

export class BookingAlreadyCancelledError extends DomainError {
  readonly statusCode = 409;
  readonly code = 'BOOKING_ALREADY_CANCELLED';

  constructor() {
    super('This booking has already been cancelled.');
  }
}

export class ForbiddenError extends DomainError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor() {
    super('You do not have permission to perform this action.');
  }
}

export class UnauthorisedError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORISED';

  constructor(message = 'Authentication required.') {
    super(message);
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Invalid email or password.');
  }
}

export class ValidationError extends DomainError {
  readonly statusCode = 422;
  readonly code = 'VALIDATION_ERROR';
  readonly fieldErrors: Record<string, string[]>;

  constructor(fieldErrors: Record<string, string[]>) {
    super('Validation failed.');
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends DomainError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

export class InternalError extends DomainError {
  readonly statusCode = 500;
  readonly code = 'INTERNAL_ERROR';

  constructor(correlationId?: string) {
    super(
      correlationId
        ? `An unexpected error occurred. Reference: ${correlationId}`
        : 'An unexpected error occurred.',
    );
  }
}
