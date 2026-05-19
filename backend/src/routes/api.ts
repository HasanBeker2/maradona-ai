import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  listActiveGroups,
  insertGroup,
  toggleGroupActive,
  listMessages,
  countMessages,
  listTasks,
  listSummaries,
  getStats,
  findGroupByChatId,
  getSetting,
} from '../services/mapping';
import { sendPrivacyNoticeIfNeeded } from '../services/groups';
import { getRecentLogs, logger } from '../utils/logger';
import { getWaStatus, getCurrentQrDataUrl, resetWhatsApp } from '../services/whatsappClient';

const JWT_SECRET = () => process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production';
const COOKIE_NAME = 'auth_token';

function createToken(username: string): string {
  return jwt.sign({ username }, JWT_SECRET(), { expiresIn: '7d' });
}

function verifyToken(token: string): { username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET()) as { username: string };
  } catch {
    return null;
  }
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const cookie = (request.cookies as any)?.[COOKIE_NAME];
  const bearer = request.headers['authorization']?.replace('Bearer ', '');
  const token = cookie ?? bearer;
  if (!token) { reply.code(401).send({ error: 'Unauthorized' }); return false; }
  const payload = verifyToken(token);
  if (!payload) { reply.code(401).send({ error: 'Unauthorized' }); return false; }
  return true;
}

const AddGroupSchema = z.object({
  chat_id: z.string().min(5),
  name: z.string().min(1),
});

const MessagesQuerySchema = z.object({
  groupId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const TasksQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  status: z.enum(['pending', 'synced', 'failed']).optional(),
});

const SummariesQuerySchema = z.object({
  groupId: z.string().uuid(),
});

export async function apiRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Auth ────────────────────────────────────────────────────────────────────

  fastify.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const adminUser = process.env.ADMIN_USERNAME ?? 'admin';
    const adminPass = process.env.ADMIN_PASSWORD ?? '';

    if (!username || !password || username !== adminUser) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Support both plain text and bcrypt-hashed passwords in env
    let valid = false;
    if (adminPass.startsWith('$2')) {
      valid = await bcrypt.compare(password, adminPass);
    } else {
      valid = password === adminPass;
    }

    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' });

    const token = createToken(username);
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return reply.send({ ok: true });
  });

  fastify.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  fastify.get('/api/auth/me', async (req, reply) => {
    const cookie = (req.cookies as any)?.[COOKIE_NAME];
    const bearer = req.headers['authorization']?.replace('Bearer ', '');
    const token = cookie ?? bearer;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return reply.code(401).send({ error: 'Unauthorized' });
    return reply.send({ username: payload.username });
  });

  // ── WhatsApp ────────────────────────────────────────────────────────────────

  fastify.get('/api/whatsapp/status', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const status = getWaStatus();
    const qr = status === 'qr' ? getCurrentQrDataUrl() : null;
    return reply.send({ status, qr });
  });

  fastify.post('/api/whatsapp/reset', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    resetWhatsApp().catch((err) => logger.error({ err }, 'Reset error'));
    return reply.send({ ok: true });
  });

  // ── Basecamp ────────────────────────────────────────────────────────────────

  fastify.get('/api/basecamp/status', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const dbToken = await getSetting('basecamp_access_token').catch(() => null);
    const connected = !!(dbToken ?? process.env.BASECAMP_ACCESS_TOKEN);
    return reply.send({ connected });
  });

  // ── Logs ────────────────────────────────────────────────────────────────────

  fastify.get('/api/logs', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    return reply.send(getRecentLogs());
  });

  // ── Groups ──────────────────────────────────────────────────────────────────

  fastify.get('/api/groups', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const groups = await listActiveGroups();
    return reply.send(groups);
  });

  fastify.post('/api/groups', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const parsed = AddGroupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const group = await insertGroup(parsed.data.chat_id, parsed.data.name);
    logger.info({ group }, 'Group added via API');
    return reply.code(201).send(group);
  });

  fastify.patch('/api/groups/:id/toggle', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const { is_active } = req.body as { is_active: boolean };
    await toggleGroupActive(id, is_active);
    return reply.send({ ok: true });
  });

  fastify.post('/api/groups/:id/privacy-notice', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const group = await findGroupByChatId(id).catch(() => null);
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    await sendPrivacyNoticeIfNeeded(group.chat_id, group.id, false);
    return reply.send({ ok: true });
  });

  // ── Messages ────────────────────────────────────────────────────────────────

  fastify.get('/api/messages', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const parsed = MessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const { groupId, page, limit } = parsed.data;
    const [messages, total] = await Promise.all([
      listMessages(groupId, page, limit),
      countMessages(groupId),
    ]);
    return reply.send({ messages, total, page, limit });
  });

  // ── Tasks ───────────────────────────────────────────────────────────────────

  fastify.get('/api/tasks', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const parsed = TasksQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const tasks = await listTasks(parsed.data.groupId, parsed.data.status);
    return reply.send(tasks);
  });

  // ── Summaries ───────────────────────────────────────────────────────────────

  fastify.get('/api/summaries', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const parsed = SummariesQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const summaries = await listSummaries(parsed.data.groupId);
    return reply.send(summaries);
  });

  // ── Stats ───────────────────────────────────────────────────────────────────

  fastify.get('/api/stats', async (req, reply) => {
    if (!await requireAuth(req, reply)) return;
    const stats = await getStats();
    return reply.send(stats);
  });
}
