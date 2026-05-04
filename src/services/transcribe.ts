import OpenAI from 'openai';
import { logger } from '../utils/logger';

const openai = new OpenAI();

const MIME_TO_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = MIME_TO_EXT[mimeType] ?? 'ogg';
  const file = new File([buffer], `audio.${ext}`, { type: mimeType.split(';')[0] });

  logger.info({ mimeType, ext, bytes: buffer.length }, 'Transcribing audio via Whisper');

  const result = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });

  logger.info({ transcript: result.text }, 'Whisper transcription complete');
  return result.text;
}
