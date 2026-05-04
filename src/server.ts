import 'dotenv/config';
import Fastify from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { authRoutes } from './routes/auth';
import { initRedis } from './services/context';
import { initDb } from './services/mapping';
import { logger } from './utils/logger';

const app = Fastify({ logger: false });

async function main() {
  if (process.env.REDIS_URL) {
    initRedis(process.env.REDIS_URL);
  }

  if (process.env.DATABASE_URL) {
    initDb(process.env.DATABASE_URL);
  }

  await app.register(webhookRoutes);
  await app.register(authRoutes);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = '0.0.0.0';

  await app.listen({ port, host });
  logger.info(`Maradona server running on port ${port}`);
}

main().catch((err) => {
  logger.error({ err }, 'Server failed to start');
  process.exit(1);
});
