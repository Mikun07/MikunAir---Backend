export {
  DomainError,
  FlightNotFoundError,
  NoSeatsAvailableError,
  BookingNotFoundError,
  BookingAlreadyCancelledError,
  ForbiddenError,
  UnauthorisedError,
  InvalidCredentialsError,
  ValidationError,
  ConflictError,
  InternalError,
} from './domain-errors.js';

export { errorHandler } from './error-handler.js';
