import { z } from 'zod';

const MediaObject = z.object({ id: z.string(), mime_type: z.string().optional() });

export const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.string(),
            metadata: z.object({ phone_number_id: z.string() }),
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  id: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  audio: MediaObject.optional(),
                  image: MediaObject.extend({ caption: z.string().optional() }).optional(),
                  document: MediaObject.extend({ filename: z.string().optional() }).optional(),
                  video: MediaObject.optional(),
                  group_id: z.string().optional(),
                  context: z.object({ id: z.string().optional(), group_id: z.string().optional() }).optional(),
                }),
              )
              .optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
          field: z.string(),
        }),
      ),
    }),
  ),
});

export type WhatsAppWebhookPayload = z.infer<typeof WhatsAppWebhookSchema>;

export type ExtractedMessage = {
  from: string;
  chatId: string;
  isGroup: boolean;
  id: string;
  timestamp: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video';
  text: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  replyToId?: string;
};

export function extractMessages(payload: WhatsAppWebhookPayload): ExtractedMessage[] {
  return payload.entry.flatMap((entry) =>
    entry.changes.flatMap((change) =>
      (change.value.messages ?? [])
        .filter((m) => ['text', 'audio', 'image', 'document', 'video'].includes(m.type))
        .map((m): ExtractedMessage => {
          const groupId = m.group_id ?? m.context?.group_id ?? null;
          const type = m.type as ExtractedMessage['type'];

          const replyToId = m.context?.id ?? undefined;

          if (type === 'text') {
            return {
              from: m.from,
              chatId: groupId ?? m.from,
              isGroup: groupId !== null,
              id: m.id,
              timestamp: m.timestamp,
              type,
              text: m.text!.body,
              replyToId,
            };
          }

          // media message
          const media = m.audio ?? m.image ?? m.document ?? m.video;
          const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
            'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
            'video/mp4': 'mp4', 'video/3gpp': '3gp',
            'application/pdf': 'pdf',
          };
          const ext = mimeToExt[media?.mime_type?.split(';')[0] ?? ''] ?? type;
          const ts = new Date(parseInt(m.timestamp, 10) * 1000);
          const dateStr = ts.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
          const filename = m.document?.filename ?? `${type}_${dateStr}.${ext}`;
          const label =
            type === 'audio' ? '[SESLİ MESAJ]'
            : type === 'image' ? `[RESİM: ${filename}]`
            : type === 'document' ? `[DOSYA: ${filename}]`
            : `[VİDEO: ${filename}]`;

          return {
            from: m.from,
            chatId: groupId ?? m.from,
            isGroup: groupId !== null,
            id: m.id,
            timestamp: m.timestamp,
            type,
            text: label,
            mediaId: media?.id,
            mimeType: media?.mime_type,
            filename,
            replyToId,
          };
        }),
    ),
  );
}
