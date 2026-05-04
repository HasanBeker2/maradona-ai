import axios from 'axios';
import { logger } from '../utils/logger';

const BASE_URL = 'https://graph.facebook.com/v19.0';

export async function sendMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    logger.info({ to, text }, 'WhatsApp message sent');
  } catch (err) {
    logger.error({ err, to }, 'Failed to send WhatsApp message');
    throw err;
  }
}
