import Redis from 'ioredis';
import type { ConversationMessage } from '../types/task';
import { logger } from '../utils/logger';

const MAX_MESSAGES = 5;
const TTL_SECONDS = 600; // 10 minutes

let redis: Redis | null = null;
const inMemoryStore = new Map<string, ConversationMessage[]>();
const activeListStore = new Map<string, string>(); // chatId → todolistId

export function initRedis(url: string): void {
  try {
    redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', (err) => {
      logger.warn({ err: { message: err.message } }, 'Redis unavailable — using in-memory store');
      redis = null;
    });
  } catch {
    logger.warn('Redis init failed — using in-memory store');
  }
}

export async function storeMessage(
  chatId: string,
  message: ConversationMessage,
): Promise<void> {
  const key = `ctx:${chatId}`;

  if (redis) {
    try {
      const raw = await redis.get(key);
      const messages: ConversationMessage[] = raw ? JSON.parse(raw) : [];
      messages.push(message);
      const trimmed = messages.slice(-MAX_MESSAGES);
      await redis.setex(key, TTL_SECONDS, JSON.stringify(trimmed));
      return;
    } catch (err) {
      logger.warn({ err }, 'Redis write failed — falling back');
    }
  }

  const messages = inMemoryStore.get(chatId) ?? [];
  messages.push(message);
  inMemoryStore.set(chatId, messages.slice(-MAX_MESSAGES));
}

export async function getMessageById(
  chatId: string,
  messageId: string,
): Promise<ConversationMessage | null> {
  const context = await getContext(chatId);
  return context.find((m) => m.messageId === messageId) ?? null;
}

export async function getLastMedia(
  chatId: string,
  mediaType?: 'audio' | 'image' | 'document' | 'video',
) {
  const context = await getContext(chatId);
  const media = context
    .filter((m) => m.mediaId && (!mediaType || m.mediaType === mediaType))
    .at(-1);
  return media ?? null;
}

export async function setActiveList(chatId: string, todolistId: string): Promise<void> {
  const key = `list:${chatId}`;
  if (redis) {
    try { await redis.setex(key, TTL_SECONDS * 6, todolistId); return; } catch {}
  }
  activeListStore.set(chatId, todolistId);
}

export async function getActiveList(chatId: string): Promise<string | null> {
  const key = `list:${chatId}`;
  if (redis) {
    try { return await redis.get(key); } catch {}
  }
  return activeListStore.get(chatId) ?? null;
}

export async function clearActiveList(chatId: string): Promise<void> {
  const key = `list:${chatId}`;
  if (redis) {
    try { await redis.del(key); return; } catch {}
  }
  activeListStore.delete(chatId);
}

export async function getContext(chatId: string): Promise<ConversationMessage[]> {
  const key = `ctx:${chatId}`;

  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      logger.warn({ err }, 'Redis read failed — falling back');
    }
  }

  return inMemoryStore.get(chatId) ?? [];
}
