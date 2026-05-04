import axios from 'axios';
import { logger } from '../utils/logger';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const token = process.env.WHATSAPP_TOKEN;
  const headers = { Authorization: `Bearer ${token}` };

  const { data: meta } = await axios.get(`${GRAPH_URL}/${mediaId}`, { headers });
  logger.info({ mediaId, url: meta.url }, 'Downloading WhatsApp media');

  const { data } = await axios.get(meta.url as string, {
    headers,
    responseType: 'arraybuffer',
  });

  return Buffer.from(data);
}
