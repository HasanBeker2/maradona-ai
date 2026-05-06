import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
} from '../services/mapping';
import { sendPrivacyNoticeIfNeeded } from '../services/groups';
import { logger } from '../utils/logger';

function checkAuth(request: any, reply: any, writeOnly = false): boolean {
  const secret = process.env.API_SECRET;
  // No secret configured, or this is a read-only route → always allow
  if (!secret || writeOnly) return true;

  const auth = request.headers['authorization'] ?? '';
  if (auth !== `Bearer ${secret}`) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
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

  // GET /api/groups
  fastify.get('/api/groups', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const groups = await listActiveGroups();
    return reply.send(groups);
  });

  // POST /api/groups
  fastify.post('/api/groups', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const parsed = AddGroupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const group = await insertGroup(parsed.data.chat_id, parsed.data.name);
    logger.info({ group }, 'Group added via API');
    return reply.code(201).send(group);
  });

  // PATCH /api/groups/:id/toggle
  fastify.patch('/api/groups/:id/toggle', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const { id } = req.params as { id: string };
    const { is_active } = req.body as { is_active: boolean };
    await toggleGroupActive(id, is_active);
    return reply.send({ ok: true });
  });

  // POST /api/groups/:id/privacy-notice
  fastify.post('/api/groups/:id/privacy-notice', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const { id } = req.params as { id: string };
    const group = await findGroupByChatId(id).catch(() => null);
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    // Force re-send by passing alreadySent=false
    await sendPrivacyNoticeIfNeeded(group.chat_id, group.id, false);
    return reply.send({ ok: true });
  });

  // GET /api/messages?groupId=&page=&limit=
  fastify.get('/api/messages', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const parsed = MessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const { groupId, page, limit } = parsed.data;
    const [messages, total] = await Promise.all([
      listMessages(groupId, page, limit),
      countMessages(groupId),
    ]);
    return reply.send({ messages, total, page, limit });
  });

  // GET /api/tasks?groupId=&status=
  fastify.get('/api/tasks', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const parsed = TasksQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const tasks = await listTasks(parsed.data.groupId, parsed.data.status);
    return reply.send(tasks);
  });

  // GET /api/summaries?groupId=
  fastify.get('/api/summaries', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const parsed = SummariesQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors });

    const summaries = await listSummaries(parsed.data.groupId);
    return reply.send(summaries);
  });

  // GET /api/stats
  fastify.get('/api/stats', async (req, reply) => {
    if (!checkAuth(req, reply, true)) return;
    const stats = await getStats();
    return reply.send(stats);
  });
}
