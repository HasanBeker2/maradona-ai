import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { logger } from '../utils/logger';
import { setSetting } from '../services/mapping';

const BASECAMP_AUTH_URL = 'https://launchpad.37signals.com/authorization/new';
const BASECAMP_TOKEN_URL = 'https://launchpad.37signals.com/authorization/token';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/auth/basecamp', async (_request, reply) => {
    const redirectUri = process.env.BASECAMP_REDIRECT_URI!;
    const url = new URL(BASECAMP_AUTH_URL);
    url.searchParams.set('type', 'web_server');
    url.searchParams.set('client_id', process.env.BASECAMP_CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirectUri);

    return reply.redirect(url.toString());
  });

  fastify.get<{ Querystring: { code?: string; error?: string } }>(
    '/auth/basecamp/callback',
    async (request, reply) => {
      const { code, error } = request.query;
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';

      if (error || !code) {
        logger.error({ error }, 'Basecamp OAuth error');
        return reply.redirect(`${frontendUrl}/dashboard?basecamp=error`);
      }

      try {
        const { data } = await axios.post(
          BASECAMP_TOKEN_URL,
          new URLSearchParams({
            type: 'web_server',
            client_id: process.env.BASECAMP_CLIENT_ID!,
            client_secret: process.env.BASECAMP_CLIENT_SECRET!,
            redirect_uri: process.env.BASECAMP_REDIRECT_URI!,
            code,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );

        await setSetting('basecamp_access_token', data.access_token);
        logger.info('Basecamp access token saved to DB');

        return reply.redirect(`${frontendUrl}/dashboard?basecamp=connected`);
      } catch (err) {
        logger.error({ err }, 'Basecamp token exchange failed');
        return reply.redirect(`${frontendUrl}/dashboard?basecamp=error`);
      }
    },
  );
}
