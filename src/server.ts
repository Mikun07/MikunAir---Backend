import { createApp } from './app.js';
import { closePool } from './shared/database/index.js';
import { logger } from './shared/logger/index.js';

const PORT = Number.parseInt(process.env['PORT'] ?? '3000', 10);

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info('MikunAir backend started', { port: PORT, env: process.env['NODE_ENV'] });
});

// Graceful shutdown — drain in-flight requests before closing DB pool
function shutdown(signal: string): void {
  logger.info(`Received ${signal} — shutting down gracefully`);

  server.close(() => {
    void closePool().then(() => {
      logger.info('Server and database pool closed');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
