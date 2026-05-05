import { markPrivacyNoticeSent } from './mapping';
import { sendToGroup } from './whatsappClient';
import { logger } from '../utils/logger';

const DEFAULT_PRIVACY_NOTICE =
  'ℹ️ *Maradona AI Asistanı*\n\n' +
  'Bu grupta Maradona AI aktif edilmiştir.\n' +
  'Grup mesajları görev yönetimi amacıyla işlenmektedir.\n' +
  '@Maradona ile başlayan mesajlara yanıt verilecektir.\n\n' +
  '_Bu bir gizlilik bildirimidir._';

export async function sendPrivacyNoticeIfNeeded(
  chatId: string,
  groupId: string,
  alreadySent: boolean,
): Promise<void> {
  if (alreadySent) return;

  const notice = process.env.PRIVACY_NOTICE_TEXT ?? DEFAULT_PRIVACY_NOTICE;
  await sendToGroup(chatId, notice);
  await markPrivacyNoticeSent(groupId);
  logger.info({ chatId }, 'Privacy notice sent');
}
