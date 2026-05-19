import { Pool } from 'pg';
import { normalizeNameForMatch } from '../utils/normalize';
import type { UserMapping } from '../types/task';
import type {
  Group,
  Message,
  Task,
  WeeklySummary,
  Stats,
  InsertMessageParams,
  InsertTaskParams,
  InsertSummaryParams,
} from '../types/db';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

// In-memory fallback for local dev without DB
const inMemoryMappings: UserMapping[] = [];

export function initDb(connectionString: string): Pool {
  pool = new Pool({ connectionString });
  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('DB not initialized — call initDb() first');
  return pool;
}

export function addInMemoryMapping(mapping: UserMapping): void {
  inMemoryMappings.push(mapping);
}

// ─── User Mappings (existing) ────────────────────────────────────────────────

export async function findBasecampUser(
  nicknameTerm: string,
): Promise<UserMapping | null> {
  const normalized = normalizeNameForMatch(nicknameTerm);

  if (pool) {
    try {
      const result = await pool.query<UserMapping>(
        `SELECT * FROM user_mappings WHERE active = true AND LOWER(nickname) LIKE $1 LIMIT 1`,
        [`%${normalized}%`],
      );
      return result.rows[0] ?? null;
    } catch (err) {
      logger.warn({ err }, 'DB lookup failed — falling back to in-memory mappings');
    }
  }

  return (
    inMemoryMappings.find(
      (m) =>
        m.active &&
        normalizeNameForMatch(m.nickname).includes(normalized),
    ) ?? null
  );
}

export async function findSimilarUsers(
  nicknameTerm: string,
): Promise<UserMapping[]> {
  const normalized = normalizeNameForMatch(nicknameTerm);

  if (pool) {
    try {
      const result = await pool.query<UserMapping>(
        `SELECT * FROM user_mappings WHERE active = true ORDER BY nickname LIMIT 5`,
      );
      return result.rows.filter((r) =>
        normalizeNameForMatch(r.nickname).includes(normalized.slice(0, 3)),
      );
    } catch {
      // fallthrough
    }
  }

  return inMemoryMappings
    .filter(
      (m) =>
        m.active &&
        normalizeNameForMatch(m.nickname).includes(normalized.slice(0, 3)),
    )
    .slice(0, 5);
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export async function findGroupByChatId(chatId: string): Promise<Group | null> {
  const p = getPool();
  const result = await p.query<Group>(
    `SELECT * FROM groups WHERE chat_id = $1 LIMIT 1`,
    [chatId],
  );
  return result.rows[0] ?? null;
}

export async function insertGroup(chatId: string, name: string): Promise<Group> {
  const p = getPool();
  const result = await p.query<Group>(
    `INSERT INTO groups (chat_id, name) VALUES ($1, $2)
     ON CONFLICT (chat_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [chatId, name],
  );
  return result.rows[0];
}

export async function markPrivacyNoticeSent(groupId: string): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE groups SET privacy_notice_sent = true WHERE id = $1`,
    [groupId],
  );
}

export async function listActiveGroups(): Promise<Group[]> {
  const p = getPool();
  const result = await p.query<Group>(
    `SELECT * FROM groups WHERE is_active = true ORDER BY created_at`,
  );
  return result.rows;
}

export async function toggleGroupActive(groupId: string, isActive: boolean): Promise<void> {
  const p = getPool();
  await p.query(`UPDATE groups SET is_active = $2 WHERE id = $1`, [groupId, isActive]);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function insertMessage(params: InsertMessageParams): Promise<Message> {
  const p = getPool();
  const result = await p.query<Message>(
    `INSERT INTO messages (group_id, sender_name, sender_phone, body, timestamp, has_trigger)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      params.groupId,
      params.senderName,
      params.senderPhone ?? null,
      params.body,
      params.timestamp,
      params.hasTrigger,
    ],
  );
  return result.rows[0];
}

export async function listMessages(
  groupId: string,
  page: number,
  limit: number,
): Promise<Message[]> {
  const p = getPool();
  const offset = (page - 1) * limit;
  const result = await p.query<Message>(
    `SELECT * FROM messages WHERE group_id = $1
     ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
    [groupId, limit, offset],
  );
  return result.rows;
}

export async function countMessages(groupId: string): Promise<number> {
  const p = getPool();
  const result = await p.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE group_id = $1`,
    [groupId],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function getRecentMessagesForContext(
  groupId: string,
  limit = 10,
): Promise<Pick<Message, 'sender_name' | 'body' | 'timestamp'>[]> {
  const p = getPool();
  const result = await p.query<Pick<Message, 'sender_name' | 'body' | 'timestamp'>>(
    `SELECT sender_name, body, timestamp FROM messages
     WHERE group_id = $1 ORDER BY timestamp DESC LIMIT $2`,
    [groupId, limit],
  );
  return result.rows.reverse();
}

export async function getMessagesForPeriod(
  groupId: string,
  from: Date,
  to: Date,
): Promise<Pick<Message, 'sender_name' | 'body' | 'timestamp'>[]> {
  const p = getPool();
  const result = await p.query<Pick<Message, 'sender_name' | 'body' | 'timestamp'>>(
    `SELECT sender_name, body, timestamp FROM messages
     WHERE group_id = $1 AND timestamp BETWEEN $2 AND $3
     ORDER BY timestamp ASC`,
    [groupId, from, to],
  );
  return result.rows;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function insertTask(params: InsertTaskParams): Promise<Task> {
  const p = getPool();
  const result = await p.query<Task>(
    `INSERT INTO tasks
       (message_id, title, assignee, deadline, project, notes, basecamp_todo_id, basecamp_url, sync_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      params.messageId,
      params.title,
      params.assignee ?? null,
      params.deadline ?? null,
      params.project ?? null,
      params.notes ?? null,
      params.basecampTodoId ?? null,
      params.basecampUrl ?? null,
      params.syncStatus,
    ],
  );
  return result.rows[0];
}

export async function listTasks(groupId?: string, status?: string): Promise<(Task & { group_name: string; chat_id: string })[]> {
  const p = getPool();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (groupId) {
    values.push(groupId);
    conditions.push(`m.group_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`t.sync_status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await p.query<Task & { group_name: string; chat_id: string }>(
    `SELECT t.*, g.name AS group_name, g.chat_id
     FROM tasks t
     JOIN messages m ON m.id = t.message_id
     JOIN groups g ON g.id = m.group_id
     ${where}
     ORDER BY t.created_at DESC`,
    values,
  );
  return result.rows;
}

export async function updateTaskSyncStatus(
  taskId: string,
  status: string,
  basecampTodoId?: string,
  basecampUrl?: string,
): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE tasks SET sync_status=$2, basecamp_todo_id=COALESCE($3, basecamp_todo_id),
     basecamp_url=COALESCE($4, basecamp_url) WHERE id=$1`,
    [taskId, status, basecampTodoId ?? null, basecampUrl ?? null],
  );
}

// ─── Weekly Summaries ────────────────────────────────────────────────────────

export async function insertSummary(params: InsertSummaryParams): Promise<WeeklySummary> {
  const p = getPool();
  const result = await p.query<WeeklySummary>(
    `INSERT INTO weekly_summaries (group_id, week_start, week_end, summary_text)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [params.groupId, params.weekStart, params.weekEnd, params.summaryText],
  );
  return result.rows[0];
}

export async function markSummarySent(summaryId: string): Promise<void> {
  const p = getPool();
  await p.query(`UPDATE weekly_summaries SET sent_at = NOW() WHERE id = $1`, [summaryId]);
}

export async function listSummaries(groupId: string): Promise<WeeklySummary[]> {
  const p = getPool();
  const result = await p.query<WeeklySummary>(
    `SELECT * FROM weekly_summaries WHERE group_id = $1 ORDER BY week_start DESC`,
    [groupId],
  );
  return result.rows;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getStats(): Promise<Stats> {
  const p = getPool();
  const result = await p.query<Stats>(`
    SELECT
      (SELECT COUNT(*) FROM groups WHERE is_active = true)::int AS total_groups,
      (SELECT COUNT(*) FROM messages)::int AS total_messages,
      (SELECT COUNT(*) FROM tasks)::int AS total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE sync_status = 'synced')::int AS synced_tasks,
      (SELECT COUNT(*) FROM tasks WHERE sync_status = 'failed')::int AS failed_tasks
  `);
  return result.rows[0];
}

export async function getSetting(key: string): Promise<string | null> {
  const result = await getPool().query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getPool().query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}
