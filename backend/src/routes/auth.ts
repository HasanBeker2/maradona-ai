import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { logger } from '../utils/logger';

const BASECAMP_AUTH_URL = 'https://launchpad.37signals.com/authorization/new';
const BASECAMP_TOKEN_URL = 'https://launchpad.37signals.com/authorization/token';
const REDIRECT_URI = 'http://localhost:3000/auth/basecamp/callback';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/auth/basecamp', async (_request, reply) => {
    const url = new URL(BASECAMP_AUTH_URL);
    url.searchParams.set('type', 'web_server');
    url.searchParams.set('client_id', process.env.BASECAMP_CLIENT_ID!);
    url.searchParams.set('redirect_uri', REDIRECT_URI);

    return reply.redirect(url.toString());
  });

  fastify.get<{ Querystring: { code?: string; error?: string } }>(
    '/auth/basecamp/callback',
    async (request, reply) => {
      const { code, error } = request.query;

      if (error || !code) {
        logger.error({ error }, 'Basecamp OAuth error');
        return reply.code(400).send(`OAuth error: ${error ?? 'no code'}`);
      }

      const { data } = await axios.post(
        BASECAMP_TOKEN_URL,
        new URLSearchParams({
          type: 'web_server',
          client_id: process.env.BASECAMP_CLIENT_ID!,
          client_secret: process.env.BASECAMP_CLIENT_SECRET!,
          redirect_uri: REDIRECT_URI,
          code,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      logger.info('=== BASECAMP TOKENS ===');
      logger.info(`ACCESS_TOKEN:  ${data.access_token}`);
      logger.info(`REFRESH_TOKEN: ${data.refresh_token}`);
      logger.info('======================');

      return reply.type('text/html').send(`
        <h2>Basecamp bağlantısı başarılı!</h2>
        <p><b>ACCESS_TOKEN:</b><br><code>${data.access_token}</code></p>
        <p><b>REFRESH_TOKEN:</b><br><code>${data.refresh_token}</code></p>
        <p>.env dosyasındaki <code>BASECAMP_ACCESS_TOKEN</code> değerini bu token ile güncelle.</p>
      `);
    },
  );
}
