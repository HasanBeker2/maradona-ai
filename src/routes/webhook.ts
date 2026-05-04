import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { containsTrigger } from '../utils/normalize';
import { parseDueDate } from '../utils/date';
import { storeMessage, getContext, getLastMedia, getMessageById, setActiveList, getActiveList, clearActiveList } from '../services/context';
import { extractTask, extractTasksFromTranscript } from '../services/claude';
import { findBasecampUser, findSimilarUsers } from '../services/mapping';
import { createTodo, createTodolist, uploadFile } from '../services/basecamp';
import { sendMessage } from '../services/whatsapp';
import { downloadMedia } from '../services/media';
import { transcribeAudio } from '../services/transcribe';
import { WhatsAppWebhookSchema, extractMessages } from '../services/parser';
import { logger } from '../utils/logger';

const VerifyQuerySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.get('/webhook', async (request, reply) => {
    const result = VerifyQuerySchema.safeParse(request.query);
    if (!result.success) return reply.code(400).send('Bad Request');

    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } =
      result.data;

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('Webhook verified');
      return reply.code(200).send(challenge);
    }

    return reply.code(403).send('Forbidden');
  });

  fastify.post('/webhook', async (request, reply) => {
    reply.code(200).send('OK');

    logger.info({ body: request.body }, 'Webhook received');

    const parsed = WhatsAppWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.warn({ errors: parsed.error.errors }, 'Invalid webhook payload');
      return;
    }

    const messages = extractMessages(parsed.data);

    for (const msg of messages) {
      const { chatId, isGroup } = msg;
      const replyTo = chatId;

      // Store every message in context (including media with placeholder text)
      await storeMessage(chatId, {
        sender: msg.from,
        text: msg.text,
        timestamp: parseInt(msg.timestamp, 10) * 1000,
        messageId: msg.id,
        mediaId: msg.mediaId,
        mediaType: msg.type === 'text' ? undefined : msg.type as 'audio' | 'image' | 'document' | 'video',
        mimeType: msg.mimeType,
        filename: msg.filename,
      });

      // Auto-process audio messages that contain the trigger in transcript
      if (msg.type === 'audio' && msg.mediaId) {
        try {
          const buffer = await downloadMedia(msg.mediaId);
          const transcript = await transcribeAudio(buffer, msg.mimeType ?? 'audio/ogg');
          logger.info({ transcript }, 'Audio auto-transcribed');

          if (!containsTrigger(transcript)) continue;

          logger.info({ chatId, transcript }, 'Voice trigger detected — processing directly');
          const voiceContext = await getContext(chatId);
          const voiceIntentExtraction = await extractTask(transcript, voiceContext);
          logger.info({ intent: voiceIntentExtraction.intent }, 'Voice intent detected');
          const activeTodolistId = await getActiveList(chatId) ?? undefined;

          // --- HELP via voice ---
          if (voiceIntentExtraction.intent === 'help') {
            await sendMessage(replyTo,
              `*Maradona Komutları*\n\n` +
              `*Görev oluştur:*\nMaradona, [başlık], [kişi], [tarih]\n\n` +
              `*Yeni liste oluştur:*\nMaradona, yeni liste oluştur: [liste adı]\n\n` +
              `*Varsayılan listeye dön:*\nMaradona, liste sıfırla\n\n` +
              `*Mesaj kaydet:*\nMaradona, üstteki mesajı kaydet\nMaradona, toparla ve kaydet\n\n` +
              `*Sesli mesaj → Görevlere dönüştür:*\n[Sesli mesaj gönder] → Maradona, görev çıkar\n\n` +
              `*Sesli mesaj → Transkript olarak kaydet:*\n[Sesli mesaj gönder] → Maradona, kaydet\n\n` +
              `*Dosya/Resim → Basecamp'e yükle:*\n[Dosya veya resim gönder] → Maradona, kaydet`
            );
            continue;
          }

          // --- CREATE LIST via voice (+ extract tasks from same transcript) ---
          if (voiceIntentExtraction.intent === 'create_list') {
            if (voiceIntentExtraction.needs_clarification && voiceIntentExtraction.clarification_question) {
              await sendMessage(replyTo, voiceIntentExtraction.clarification_question);
              continue;
            }
            const listName = voiceIntentExtraction.title ?? `Liste ${new Date().toLocaleDateString('tr-TR')}`;
            const list = await createTodolist(listName);
            await setActiveList(chatId, String(list.id));
            logger.info({ listName, id: list.id }, 'Todolist created via voice command');

            // Also extract tasks from the same transcript and add to new list
            const taskExtraction = await extractTasksFromTranscript(transcript);
            if (taskExtraction.tasks.length > 0) {
              const lines: string[] = [];
              for (const task of taskExtraction.tasks) {
                let assigneeId: string | undefined;
                if (task.assignee_name) {
                  const user = await findBasecampUser(task.assignee_name);
                  assigneeId = user?.basecamp_user_id;
                }
                const dueOn = parseDueDate(task.due_date_text ?? null);
                const todo = await createTodo({
                  title: task.title,
                  assigneeId,
                  dueOn,
                  description: `Transcript: ${transcript}`,
                  todolistId: String(list.id),
                });
                lines.push(`• ${task.assignee_name ?? 'Unassigned'} — ${task.title}: ${todo.app_url}`);
              }
              await sendMessage(replyTo,
                `"${listName}" listesi oluşturuldu ve ${taskExtraction.tasks.length} görev eklendi:\n${lines.join('\n')}`
              );
            } else {
              await sendMessage(replyTo, `"${listName}" listesi oluşturuldu. Bundan sonraki görevler bu listeye eklenecek: ${list.app_url}`);
            }
            continue;
          }

          // --- RESET LIST via voice ---
          if (voiceIntentExtraction.intent === 'reset_list') {
            await clearActiveList(chatId);
            await sendMessage(replyTo, 'Varsayılan listeye döndü. Bundan sonraki görevler ana listeye eklenecek.');
            continue;
          }

          // --- Default: extract tasks from transcript ---
          const voiceExtraction = await extractTasksFromTranscript(transcript);

          if (voiceExtraction.needs_clarification && voiceExtraction.clarification_question) {
            await sendMessage(replyTo, voiceExtraction.clarification_question);
            continue;
          }
          if (voiceExtraction.tasks.length === 0) {
            await sendMessage(replyTo, 'Sesli mesajda görev bulamadım.');
            continue;
          }

          const lines: string[] = [];
          for (const task of voiceExtraction.tasks) {
            let assigneeId: string | undefined;
            if (task.assignee_name) {
              const user = await findBasecampUser(task.assignee_name);
              assigneeId = user?.basecamp_user_id;
            }
            const dueOn = parseDueDate(task.due_date_text ?? null);
            const todo = await createTodo({
              title: task.title,
              assigneeId,
              dueOn,
              description: `Transcript: ${transcript}`,
              todolistId: activeTodolistId,
            });
            lines.push(`• ${task.assignee_name ?? 'Unassigned'} — ${task.title}: ${todo.app_url}`);
          }
          await sendMessage(replyTo, `${voiceExtraction.tasks.length} görev oluşturuldu:\n${lines.join('\n')}`);
          logger.info({ count: voiceExtraction.tasks.length }, 'Voice trigger tasks created');
        } catch (err) {
          logger.error({ err }, 'Error processing voice trigger');
          await sendMessage(replyTo, 'Sesli mesaj işlenirken hata oluştu.').catch(() => {});
        }
        continue;
      }

      // Only process text messages that contain the trigger
      if (msg.type !== 'text' || !containsTrigger(msg.text)) continue;

      logger.info({ from: msg.from, chatId, isGroup, text: msg.text }, 'Trigger detected');

      try {
        const context = await getContext(chatId);
        const contextWithoutTrigger = context.slice(0, -1);

        const extraction = await extractTask(msg.text, contextWithoutTrigger);
        logger.info({ extraction }, 'Claude extraction result');

        const activeTodolistId = await getActiveList(chatId) ?? undefined;

        // --- HELP: list all commands ---
        if (extraction.intent === 'help') {
          await sendMessage(replyTo,
            `*Maradona Komutları*\n\n` +
            `*Görev oluştur:*\nMaradona, [başlık], [kişi], [tarih]\n\n` +
            `*Yeni liste oluştur:*\nMaradona, yeni liste oluştur: [liste adı]\n\n` +
            `*Varsayılan listeye dön:*\nMaradona, liste sıfırla\n\n` +
            `*Mesaj kaydet:*\nMaradona, üstteki mesajı kaydet\nMaradona, toparla ve kaydet\n\n` +
            `*Sesli mesaj → Görevlere dönüştür:*\n[Sesli mesaj gönder] → Maradona, görev çıkar\n\n` +
            `*Sesli mesaj → Transkript olarak kaydet:*\n[Sesli mesaj gönder] → Maradona, kaydet\n\n` +
            `*Dosya/Resim → Basecamp'e yükle:*\n[Dosya veya resim gönder] → Maradona, kaydet`
          );
          continue;
        }

        // --- CREATE LIST: new Basecamp todolist ---
        if (extraction.intent === 'create_list') {
          if (extraction.needs_clarification && extraction.clarification_question) {
            await sendMessage(replyTo, extraction.clarification_question);
            continue;
          }
          const listName = extraction.title ?? `Liste ${new Date().toLocaleDateString('tr-TR')}`;
          const list = await createTodolist(listName);
          await setActiveList(chatId, String(list.id));
          await sendMessage(replyTo, `"${listName}" listesi oluşturuldu. Bundan sonraki görevler bu listeye eklenecek: ${list.app_url}`);
          logger.info({ listName, id: list.id }, 'Todolist created and set as active');
          continue;
        }

        // --- RESET LIST: go back to default ---
        if (extraction.intent === 'reset_list') {
          await clearActiveList(chatId);
          await sendMessage(replyTo, 'Varsayılan listeye döndü. Bundan sonraki görevler ana listeye eklenecek.');
          continue;
        }

        // --- VOICE TASK: transcribe + extract multiple tasks ---
        if (extraction.intent === 'voice_task') {
          const lastAudio = (msg.replyToId ? await getMessageById(chatId, msg.replyToId) : null)
            ?? await getLastMedia(chatId, 'audio');
          if (!lastAudio?.mediaId) {
            await sendMessage(replyTo, 'Önceki bir sesli mesaj bulamadım.');
            continue;
          }
          const buffer = await downloadMedia(lastAudio.mediaId);
          const transcript = await transcribeAudio(buffer, lastAudio.mimeType ?? 'audio/ogg');
          logger.info({ transcript }, 'Voice task transcript');

          const voiceExtraction = await extractTasksFromTranscript(transcript);

          if (voiceExtraction.needs_clarification && voiceExtraction.clarification_question) {
            await sendMessage(replyTo, voiceExtraction.clarification_question);
            continue;
          }

          if (voiceExtraction.tasks.length === 0) {
            await sendMessage(replyTo, 'Sesli mesajda görev bulamadım.');
            continue;
          }

          const lines: string[] = [];
          for (const task of voiceExtraction.tasks) {
            let assigneeId: string | undefined;
            if (task.assignee_name) {
              const user = await findBasecampUser(task.assignee_name);
              assigneeId = user?.basecamp_user_id;
            }
            const dueOn = parseDueDate(task.due_date_text ?? null);
            const todo = await createTodo({
              title: task.title,
              assigneeId,
              dueOn,
              description: `Transcript: ${transcript}`,
              todolistId: activeTodolistId,
            });
            const name = task.assignee_name ?? 'Unassigned';
            lines.push(`• ${name} — ${task.title}: ${todo.app_url}`);
          }

          await sendMessage(replyTo, `${voiceExtraction.tasks.length} görev oluşturuldu:\n${lines.join('\n')}`);
          logger.info({ count: voiceExtraction.tasks.length }, 'Voice tasks created');
          continue;
        }

        // --- VOICE SAVE: transcribe + save as note ---
        if (extraction.intent === 'voice_save') {
          const lastAudio = (msg.replyToId ? await getMessageById(chatId, msg.replyToId) : null)
            ?? await getLastMedia(chatId, 'audio');
          if (!lastAudio?.mediaId) {
            await sendMessage(replyTo, 'Önceki bir sesli mesaj bulamadım.');
            continue;
          }
          const buffer = await downloadMedia(lastAudio.mediaId);
          const transcript = await transcribeAudio(buffer, lastAudio.mimeType ?? 'audio/ogg');
          logger.info({ transcript }, 'Voice save transcript');

          const todo = await createTodo({
            title: `Sesli not — ${new Date().toLocaleDateString('tr-TR')}`,
            description: transcript,
            todolistId: activeTodolistId,
          });
          await sendMessage(replyTo, `Sesli mesaj transkript edildi ve kaydedildi: ${todo.app_url}`);
          logger.info({ todo }, 'Voice transcript saved');
          continue;
        }

        // --- FILE SAVE: upload to Basecamp vault ---
        if (extraction.intent === 'file_save') {
          const lastFile = msg.replyToId
            ? await getMessageById(chatId, msg.replyToId)
            : await getLastMedia(chatId, 'image') ?? await getLastMedia(chatId, 'document') ?? await getLastMedia(chatId, 'video');
          if (!lastFile?.mediaId) {
            await sendMessage(replyTo, 'Önceki bir dosya veya resim bulamadım.');
            continue;
          }
          const buffer = await downloadMedia(lastFile.mediaId);
          const filename = lastFile.filename ?? `file_${Date.now()}`;
          const mimeType = lastFile.mimeType ?? 'application/octet-stream';
          const result = await uploadFile(buffer, filename, mimeType);
          await sendMessage(replyTo, `Dosya Basecamp'e yüklendi: ${result.app_url}`);
          logger.info({ filename, app_url: result.app_url }, 'File uploaded to Basecamp');
          continue;
        }

        // --- TEXT SAVE: save/summarize text context ---
        if (extraction.intent === 'save') {
          const saveMessages = extraction.use_previous_message_only
            ? contextWithoutTrigger.slice(-1)
            : contextWithoutTrigger;

          const description = saveMessages
            .map((m) => `[${m.sender}]: ${m.text}`)
            .join('\n');

          const title = extraction.title ?? description.slice(0, 100);
          const todo = await createTodo({ title, description: description || undefined, todolistId: activeTodolistId });

          const confirmation = extraction.use_previous_message_only
            ? `Mesaj kaydedildi: ${todo.app_url}`
            : `Konuşma özetlendi ve kaydedildi: ${todo.app_url}`;
          await sendMessage(replyTo, confirmation);
          logger.info({ todo }, 'Save intent — todo created');
          continue;
        }

        // --- TASK: create todo from text ---
        if (extraction.needs_clarification && extraction.clarification_question) {
          await sendMessage(replyTo, extraction.clarification_question);
          continue;
        }

        if (!extraction.is_task) {
          logger.info('Message not identified as a task — ignoring');
          continue;
        }

        let assigneeId: string | undefined;

        if (extraction.assignee_name) {
          const user = await findBasecampUser(extraction.assignee_name);

          if (!user) {
            const similar = await findSimilarUsers(extraction.assignee_name);
            const suggestion = similar[0]?.nickname;
            const clarification = suggestion
              ? `"${extraction.assignee_name}" isimli bir Basecamp kullanıcısı bulunamadı. "${suggestion}" mi demek istediniz?`
              : `"${extraction.assignee_name}" isimli bir Basecamp kullanıcısı bulunamadı. Atama olmadan görevi oluşturuyorum.`;

            await sendMessage(replyTo, clarification);

            if (!suggestion) {
              assigneeId = undefined;
            } else {
              continue;
            }
          } else {
            assigneeId = user.basecamp_user_id;
          }
        }

        const dueOn = parseDueDate(extraction.due_date_text ?? null);
        const contextLines = contextWithoutTrigger
          .map((m) => `[${m.sender}]: ${m.text}`)
          .join('\n');

        const todo = await createTodo({
          title: extraction.title ?? msg.text.slice(0, 100),
          assigneeId,
          dueOn,
          description: contextLines || undefined,
          todolistId: activeTodolistId,
        });

        const assigneeName = extraction.assignee_name ?? 'Unassigned';
        await sendMessage(replyTo, `Görev oluşturuldu — ${assigneeName}: ${todo.app_url}`);
        logger.info({ todo }, 'Task created successfully');

      } catch (err) {
        logger.error({ err, from: msg.from }, 'Error processing message');
        await sendMessage(replyTo, 'Bir hata oluştu. Lütfen tekrar deneyin.').catch(() => {});
      }
    }
  });
}
