import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger';
import { containsTrigger } from '../utils/normalize';
import {
  findGroupByChatId,
  insertGroup,
  insertMessage,
} from './mapping';
import { sendPrivacyNoticeIfNeeded } from './groups';
import { handleTriggerMessage } from './messageHandler';

let client: Client;

export function getClient(): Client {
  return client;
}

export async function sendToGroup(chatId: string, text: string): Promise<void> {
  try {
    await client.sendMessage(chatId, text);
  } catch (err) {
    logger.error({ chatId, err }, 'Failed to send WhatsApp message');
  }
}

export function initWhatsAppClient(): void {
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

  client.on('qr', (qr) => {
    logger.info('Scan the QR code below to authenticate WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    logger.info({ wid: client.info.wid._serialized }, 'WhatsApp client ready');
  });

  client.on('auth_failure', (msg) => {
    logger.error({ msg }, 'WhatsApp authentication failed');
  });

  client.on('disconnected', (reason) => {
    logger.warn({ reason }, 'WhatsApp client disconnected');
  });

  client.on('message', async (message: Message) => {

    // Only process group messages
    const chat = await message.getChat();
    if (!chat.isGroup) return;

    const chatId = chat.id._serialized;
    const chatName = chat.name;

    try {
      // Ensure group exists in DB and is whitelisted
      let group = await findGroupByChatId(chatId);
      if (!group) {
        // Auto-register on first message (admin can deactivate via dashboard)
        group = await insertGroup(chatId, chatName);
        logger.info({ chatId, chatName }, 'New group registered');
      }

      if (!group.is_active) return;

      // Send privacy notice on first interaction
      await sendPrivacyNoticeIfNeeded(chatId, group.id, group.privacy_notice_sent);

      const contact = await message.getContact();
      const senderName = contact.pushname || contact.name || contact.number;
      const senderPhone = contact.number;
      const body = message.body ?? '';
      const timestamp = new Date(message.timestamp * 1000);

      // Detect @Maradona trigger: check mentionedIds or body keyword
      const botJid = client.info.wid._serialized;
      const mentionedIds: string[] = (message.mentionedIds ?? []) as unknown as string[];
      const isVoice = message.hasMedia && (message.type === 'audio' || message.type === 'ptt');

      // For voice messages: always pass to handler (transcript decides if triggered)
      // For text messages: check @mention or keyword
      const isMentioned =
        isVoice ||
        mentionedIds.some((id) => id === botJid) ||
        containsTrigger(body);

      // Persist message to DB
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
