import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { authRoutes } from './routes/auth';
import { apiRoutes } from './routes/api';
import { initDb } from './services/mapping';
import { runMigrations } from './db/migrate';
import { initWhatsAppClient } from './services/whatsappClient';
import { startScheduler } from './services/scheduler';
import { logger } from './utils/logger';

const app = Fastify({ logger: false });

async function main() {
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = initDb(process.env.DATABASE_URL);
  await runMigrations(pool);

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  });

  await app.register(authRoutes);
  await app.register(apiRoutes);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  logger.info(`Maradona backend running on port ${port}`);

  // Start WhatsApp client (non-blocking — prints QR to terminal)
  initWhatsAppClient();

  // Register weekly summary cron
  startScheduler();
}

main().catch((err) => {
  logger.error({ err }, 'Server failed to start');
  process.exit(1);
});
