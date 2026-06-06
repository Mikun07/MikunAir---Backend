import winston from 'winston';
import { sanitise } from './sanitiser.js';

const { combine, timestamp, json, errors } = winston.format;

function createSanitisedFormat(): winston.Logform.Format {
  return {
    transform(info: winston.Logform.TransformableInfo): winston.Logform.TransformableInfo {
      const { level, message, ...meta } = info as Record<string, unknown>;
      const sanitised = sanitise(meta);
      return { level: level as string, message: message as string, ...sanitised };
    },
  };
}

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    createSanitisedFormat(),
    json(),
  ),
  transports: [new winston.transports.Console()],
});

export type Logger = typeof logger;

export function childLogger(correlationId: string, context?: Record<string, unknown>): Logger {
  return logger.child({ correlationId, ...context });
}
