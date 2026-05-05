import type { Message } from 'whatsapp-web.js';
import { parseDueDate } from '../utils/date';
import { extractTask, extractTasksFromTranscript } from './claude';
import { findBasecampUser, findSimilarUsers, getRecentMessagesForContext, insertTask } from './mapping';
import { createTodo, createTodolist, uploadFile } from './basecamp';
import { sendToGroup, downloadMediaFromMessage } from './whatsappClient';
import { transcribeAudio } from './transcribe';
import { logger } from '../utils/logger';
import type { ConversationMessage } from '../types/task';

// In-memory active list per chat (replaces Redis-based active list)
const activeLists = new Map<string, string>();

interface TriggerContext {
  message: Message;
  savedMessageId: string;
  groupId: string;
  chatId: string;
  senderName: string;
  body: string;
}

export async function handleTriggerMessage(ctx: TriggerContext): Promise<void> {
  const { message, savedMessageId, groupId, chatId, senderName, body } = ctx;

  try {
    // Auto-process audio messages
    if (message.hasMedia && message.type === 'audio') {
      await handleVoiceAutoProcess(message, savedMessageId, chatId, groupId);
      return;
    }

    const contextRows = await getRecentMessagesForContext(groupId, 10);
    const context: ConversationMessage[] = contextRows.map((r) => ({
      sender: r.sender_name,
      text: r.body,
      timestamp: new Date(r.timestamp).getTime(),
    }));
    const contextWithoutTrigger = context.slice(0, -1);

    const extraction = await extractTask(body, contextWithoutTrigger);
    logger.info({ extraction }, 'Claude extraction result');

    const activeTodolistId = activeLists.get(chatId);

    // HELP
    if (extraction.intent === 'help') {
      await sendToGroup(chatId, buildHelpText());
      return;
    }

    // CREATE LIST
    if (extraction.intent === 'create_list') {
      if (extraction.needs_clarification && extraction.clarification_question) {
        await sendToGroup(chatId, extraction.clarification_question);
        return;
      }
      const listName = extraction.title ?? `Liste ${new Date().toLocaleDateString('tr-TR')}`;
      const list = await createTodolist(listName);
      activeLists.set(chatId, String(list.id));
      await sendToGroup(chatId, `"${listName}" listesi oluşturuldu: ${list.app_url}`);
      await insertTask({ messageId: savedMessageId, title: `Liste oluşturuldu: ${listName}`, syncStatus: 'synced', basecampUrl: list.app_url });
      return;
    }

    // RESET LIST
    if (extraction.intent === 'reset_list') {
      activeLists.delete(chatId);
      await sendToGroup(chatId, 'Varsayılan listeye döndü.');
      return;
    }

    // VOICE TASK
    if (extraction.intent === 'voice_task') {
      const quoted = await message.getQuotedMessage().catch(() => null);
      const audioMsg = (quoted?.hasMedia && quoted?.type === 'audio') ? quoted : null;
      if (!audioMsg) {
        await sendToGroup(chatId, 'Sesli mesaj bulunamadı. Bir sesli mesajı alıntılayarak komut verin.');
        return;
      }
      const media = await downloadMediaFromMessage(audioMsg);
      if (!media) { await sendToGroup(chatId, 'Sesli mesaj indirilemedi.'); return; }

      const transcript = await transcribeAudio(media.buffer, media.mimeType);
      const voiceExtraction = await extractTasksFromTranscript(transcript);

      if (voiceExtraction.needs_clarification && voiceExtraction.clarification_question) {
        await sendToGroup(chatId, voiceExtraction.clarification_question);
        return;
      }
      if (voiceExtraction.tasks.length === 0) {
        await sendToGroup(chatId, 'Sesli mesajda görev bulamadım.');
        return;
      }

      const lines: string[] = [];
      for (const task of voiceExtraction.tasks) {
        const result = await createTaskAndPersist({
          messageId: savedMessageId,
          title: task.title,
          assigneeName: task.assignee_name,
          dueDateText: task.due_date_text,
          notes: `Transcript: ${transcript}`,
          todolistId: activeTodolistId,
        });
        lines.push(`• ${task.assignee_name ?? 'Atanmamış'} — ${task.title}: ${result.url}`);
      }
      await sendToGroup(chatId, `${voiceExtraction.tasks.length} görev oluşturuldu:\n${lines.join('\n')}`);
      return;
    }

    // VOICE SAVE
    if (extraction.intent === 'voice_save') {
      const quoted = await message.getQuotedMessage().catch(() => null);
      const audioMsg = (quoted?.hasMedia && quoted?.type === 'audio') ? quoted : null;
      if (!audioMsg) { await sendToGroup(chatId, 'Sesli mesaj bulunamadı.'); return; }

      const media = await downloadMediaFromMessage(audioMsg);
      if (!media) { await sendToGroup(chatId, 'Sesli mesaj indirilemedi.'); return; }

      const transcript = await transcribeAudio(media.buffer, media.mimeType);
      const todo = await createTodo({
        title: `Sesli not — ${new Date().toLocaleDateString('tr-TR')}`,
        description: transcript,
        todolistId: activeTodolistId,
      });
      await insertTask({ messageId: savedMessageId, title: todo.title, syncStatus: 'synced', basecampTodoId: String(todo.id), basecampUrl: todo.app_url });
      await sendToGroup(chatId, `Sesli mesaj transkript edildi ve kaydedildi: ${todo.app_url}`);
      return;
    }

    // FILE SAVE
    if (extraction.intent === 'file_save') {
      const quoted = await message.getQuotedMessage().catch(() => null);
      const fileMsg = (quoted?.hasMedia) ? quoted : null;
      if (!fileMsg) { await sendToGroup(chatId, 'Dosya veya resim bulunamadı.'); return; }

      const media = await downloadMediaFromMessage(fileMsg);
      if (!media) { await sendToGroup(chatId, 'Dosya indirilemedi.'); return; }

      const filename = `file_${Date.now()}`;
      const result = await uploadFile(media.buffer, filename, media.mimeType);
      await insertTask({ messageId: savedMessageId, title: `Dosya yüklendi: ${filename}`, syncStatus: 'synced', basecampUrl: result.app_url });
      await sendToGroup(chatId, `Dosya Basecamp'e yüklendi: ${result.app_url}`);
      return;
    }

    // TEXT SAVE
    if (extraction.intent === 'save') {
      const saveMessages = extraction.use_previous_message_only
        ? contextWithoutTrigger.slice(-1)
        : contextWithoutTrigger;
      const description = saveMessages.map((m) => `[${m.sender}]: ${m.text}`).join('\n');
      const title = extraction.title ?? description.slice(0, 100);
      const todo = await createTodo({ title, description: description || undefined, todolistId: activeTodolistId });
      await insertTask({ messageId: savedMessageId, title, syncStatus: 'synced', basecampTodoId: String(todo.id), basecampUrl: todo.app_url });
      const msg = extraction.use_previous_message_only
        ? `Mesaj kaydedildi: ${todo.app_url}`
        : `Konuşma özetlendi ve kaydedildi: ${todo.app_url}`;
      await sendToGroup(chatId, msg);
      return;
    }

    // TASK (default)
    if (extraction.needs_clarification && extraction.clarification_question) {
      await sendToGroup(chatId, extraction.clarification_question);
      return;
    }
    if (!extraction.is_task) {
      logger.info('Message not identified as a task — ignoring');
      return;
    }

    const result = await createTaskAndPersist({
      messageId: savedMessageId,
      title: extraction.title ?? body.slice(0, 100),
      assigneeName: extraction.assignee_name,
      dueDateText: extraction.due_date_text,
      notes: contextWithoutTrigger.map((m) => `[${m.sender}]: ${m.text}`).join('\n') || undefined,
      todolistId: activeTodolistId,
      project: (extraction as any).project,
    });

    await sendToGroup(chatId, `Görev oluşturuldu — ${result.assigneeName ?? 'Atanmamış'}: ${result.url}`);
    logger.info({ url: result.url }, 'Task created successfully');

  } catch (err) {
    logger.error({ err, chatId, senderName }, 'Error processing trigger message');
    await sendToGroup(chatId, 'Bir hata oluştu. Lütfen tekrar deneyin.').catch(() => {});
  }
}

async function handleVoiceAutoProcess(
  message: Message,
  savedMessageId: string,
  chatId: string,
  groupId: string,
): Promise<void> {
  try {
    const media = await downloadMediaFromMessage(message);
    if (!media) return;

    const transcript = await transcribeAudio(media.buffer, media.mimeType);
    logger.info({ transcript }, 'Audio auto-transcribed');

    const contextRows = await getRecentMessagesForContext(groupId, 10);
    const context: ConversationMessage[] = contextRows.map((r) => ({
      sender: r.sender_name,
      text: r.body,
      timestamp: new Date(r.timestamp).getTime(),
    }));

    const voiceIntent = await extractTask(transcript, context);
    const activeTodolistId = activeLists.get(chatId);

    if (voiceIntent.intent === 'help') {
      await sendToGroup(chatId, buildHelpText());
      return;
    }

    if (voiceIntent.intent === 'create_list') {
      const listName = voiceIntent.title ?? `Liste ${new Date().toLocaleDateString('tr-TR')}`;
      const list = await createTodolist(listName);
      activeLists.set(chatId, String(list.id));

      const taskExtraction = await extractTasksFromTranscript(transcript);
      if (taskExtraction.tasks.length > 0) {
        const lines: string[] = [];
        for (const task of taskExtraction.tasks) {
          const r = await createTaskAndPersist({ messageId: savedMessageId, title: task.title, assigneeName: task.assignee_name, dueDateText: task.due_date_text, notes: `Transcript: ${transcript}`, todolistId: String(list.id) });
          lines.push(`• ${task.assignee_name ?? 'Atanmamış'} — ${task.title}: ${r.url}`);
        }
        await sendToGroup(chatId, `"${listName}" listesi oluşturuldu ve ${taskExtraction.tasks.length} görev eklendi:\n${lines.join('\n')}`);
      } else {
        await sendToGroup(chatId, `"${listName}" listesi oluşturuldu: ${list.app_url}`);
        await insertTask({ messageId: savedMessageId, title: `Liste: ${listName}`, syncStatus: 'synced', basecampUrl: list.app_url });
      }
      return;
    }

    if (voiceIntent.intent === 'reset_list') {
      activeLists.delete(chatId);
      await sendToGroup(chatId, 'Varsayılan listeye döndü.');
      return;
    }

    const voiceExtraction = await extractTasksFromTranscript(transcript);
    if (voiceExtraction.needs_clarification && voiceExtraction.clarification_question) {
      await sendToGroup(chatId, voiceExtraction.clarification_question);
      return;
    }
    if (voiceExtraction.tasks.length === 0) {
      await sendToGroup(chatId, 'Sesli mesajda görev bulamadım.');
      return;
    }

    const lines: string[] = [];
    for (const task of voiceExtraction.tasks) {
      const r = await createTaskAndPersist({ messageId: savedMessageId, title: task.title, assigneeName: task.assignee_name, dueDateText: task.due_date_text, notes: `Transcript: ${transcript}`, todolistId: activeTodolistId });
      lines.push(`• ${task.assignee_name ?? 'Atanmamış'} — ${task.title}: ${r.url}`);
    }
    await sendToGroup(chatId, `${voiceExtraction.tasks.length} görev oluşturuldu:\n${lines.join('\n')}`);
  } catch (err) {
    logger.error({ err }, 'Error in voice auto-process');
  }
}

async function createTaskAndPersist(params: {
  messageId: string;
  title: string;
  assigneeName?: string | null;
  dueDateText?: string | null;
  notes?: string;
  todolistId?: string;
  project?: string | null;
}): Promise<{ url: string; assigneeName: string | null }> {
  let assigneeId: string | undefined;
  let resolvedAssigneeName = params.assigneeName ?? null;

  if (params.assigneeName) {
    const user = await findBasecampUser(params.assigneeName);
    if (!user) {
      const similar = await findSimilarUsers(params.assigneeName);
      resolvedAssigneeName = similar[0]?.nickname ?? params.assigneeName;
    } else {
      assigneeId = user.basecamp_user_id;
    }
  }

  const dueOn = parseDueDate(params.dueDateText ?? null);

  const todo = await createTodo({
    title: params.title,
    assigneeId,
    dueOn,
    description: params.notes,
    todolistId: params.todolistId,
  });

  await insertTask({
    messageId: params.messageId,
    title: params.title,
    assignee: resolvedAssigneeName ?? undefined,
    deadline: dueOn ?? undefined,
    project: params.project ?? undefined,
    basecampTodoId: String(todo.id),
    basecampUrl: todo.app_url,
    syncStatus: 'synced',
  });

  return { url: todo.app_url, assigneeName: resolvedAssigneeName };
}

function buildHelpText(): string {
  return (
    `*Maradona Komutları*\n\n` +
    `*Görev oluştur:*\n@Maradona, [başlık], [kişi], [tarih]\n\n` +
    `*Yeni liste oluştur:*\n@Maradona, yeni liste oluştur: [liste adı]\n\n` +
    `*Varsayılan listeye dön:*\n@Maradona, liste sıfırla\n\n` +
    `*Mesaj kaydet:*\n@Maradona, üstteki mesajı kaydet\n@Maradona, toparla ve kaydet\n\n` +
    `*Sesli mesaj → Görevlere dönüştür:*\n[Sesli mesajı alıntıla] → @Maradona, görev çıkar\n\n` +
    `*Dosya/Resim → Basecamp'e yükle:*\n[Dosyayı alıntıla] → @Maradona, kaydet`
  );
}
