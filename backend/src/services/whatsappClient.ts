import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import { logger } from '../utils/logger';
import { containsTrigger } from '../utils/normalize';
import {
  findGroupByChatId,
  insertGroup,
  insertMessage,
} from './mapping';
import { sendPrivacyNoticeIfNeeded } from './groups';
import { handleTriggerMessage } from './messageHandler';

export type WaStatus = 'initializing' | 'qr' | 'ready' | 'disconnected';

let client: Client;
let currentQr: string | null = null;
let waStatus: WaStatus = 'initializing';

export function getClient(): Client {
  return client;
}

export function getWaStatus(): WaStatus {
  return waStatus;
}

export function getCurrentQrDataUrl(): string | null {
  return currentQr;
}

export async function sendToGroup(chatId: string, text: string): Promise<void> {
  try {
    await client.sendMessage(chatId, text);
  } catch (err) {
    logger.error({ chatId, err }, 'Failed to send WhatsApp message');
  }
}

export async function resetWhatsApp(): Promise<void> {
  logger.info('WhatsApp reset requested');
  waStatus = 'initializing';
  currentQr = null;

  try {
    await client.destroy();
  } catch {
    // ignore destroy errors
  }

  const authPath = process.env.WWEBJS_AUTH_PATH ?? '.wwebjs_auth';
  try {
    // Delete contents but not the mount point directory itself
    for (const entry of fs.readdirSync(authPath)) {
      fs.rmSync(`${authPath}/${entry}`, { recursive: true, force: true });
    }
    logger.info({ authPath }, 'WhatsApp session cleared');
  } catch (err) {
    logger.warn({ err, authPath }, 'Could not clear session dir');
  }

  initWhatsAppClient();
}

function clearChromiumLocks(): void {
  const authPath = process.env.WWEBJS_AUTH_PATH ?? '.wwebjs_auth';
  const lockPatterns = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  try {
    const sessionDir = fs.readdirSync(authPath, { recursive: true, withFileTypes: true }) as fs.Dirent[];
    for (const entry of sessionDir) {
      if (lockPatterns.some((p) => entry.name === p)) {
        const full = `${entry.parentPath ?? (entry as any).path}/${entry.name}`;
        fs.rmSync(full, { force: true });
        logger.info({ file: full }, 'Removed Chromium lock file');
      }
    }
  } catch {
    // auth dir may not exist yet
  }
}

export function initWhatsAppClient(): void {
  waStatus = 'initializing';
  currentQr = null;

  clearChromiumLocks();

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: process.env.WWEBJS_AUTH_PATH ?? '.wwebjs_auth',
    }),
    puppeteer: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
  });

  client.on('qr', async (qr) => {
    waStatus = 'qr';
    logger.info('Scan the QR code below to authenticate WhatsApp:');
    qrcode.generate(qr, { small: true });
    try {
      currentQr = await QRCode.toDataURL(qr);
    } catch {
      currentQr = null;
    }
  });

  client.on('ready', () => {
    waStatus = 'ready';
    currentQr = null;
    logger.info({ wid: client.info.wid._serialized }, 'WhatsApp client ready');
  });

  client.on('auth_failure', (msg) => {
    waStatus = 'disconnected';
    logger.error({ msg }, 'WhatsApp authentication failed');
  });

  client.on('disconnected', (reason) => {
    waStatus = 'disconnected';
    currentQr = null;
    logger.warn({ reason }, 'WhatsApp client disconnected');
  });

  client.on('message', async (message: Message) => {

    // Only process group messages
    const chat = await message.getChat();
    if (!chat.isGroup) return;

    const chatId = chat.id._serialized;
    const chatName = chat.name;

    try {
      let group = await findGroupByChatId(chatId);
      if (!group) {
        group = await insertGroup(chatId, chatName);
        logger.info({ chatId, chatName }, 'New group registered');
      }

      if (!group.is_active) return;

      await sendPrivacyNoticeIfNeeded(chatId, group.id, group.privacy_notice_sent);

      const contact = await message.getContact();
      const senderName = contact.pushname || contact.name || contact.number;
      const senderPhone = contact.number;
      const body = message.body ?? '';
      const timestamp = new Date(message.timestamp * 1000);

      const botJid = client.info.wid._serialized;
      const mentionedIds: string[] = (message.mentionedIds ?? []) as unknown as string[];
      const isVoice = message.hasMedia && (message.type === 'audio' || message.type === 'ptt');
      const isExplicitMention = mentionedIds.some((id) => id === botJid);

      // For non-voice media (documents, images, videos), only trigger on explicit @mention
      // to avoid false triggers from filenames containing "maradona"
      const isMentioned =
        isVoice ||
        isExplicitMention ||
        (!message.hasMedia && containsTrigger(body));

      const savedMessage = await insertMessage({
        groupId: group.id,
        senderName,
        senderPhone,
        body,
        timestamp,
        hasTrigger: isMentioned,
      });

      if (isMentioned) {
        logger.info({ chatId, senderName, type: message.type }, '@Maradona triggered');
        await handleTriggerMessage({
          message,
          savedMessageId: savedMessage.id,
          groupId: group.id,
          chatId,
          senderName,
          body,
        });
      }
    } catch (err) {
      logger.error({ chatId, err }, 'Error processing WhatsApp message');
    }
  });

  client.initialize().catch((err) => {
    logger.error({ err }, 'WhatsApp client initialization failed');
    waStatus = 'disconnected';
  });
}

export async function downloadMediaFromMessage(message: Message): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const media: MessageMedia = await message.downloadMedia();
    if (!media?.data) return null;
    return {
      buffer: Buffer.from(media.data, 'base64'),
      mimeType: media.mimetype,
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to download media');
    return null;
  }
}
