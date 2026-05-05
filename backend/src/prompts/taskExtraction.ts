import type { ConversationMessage } from '../types/task';

export function buildTaskExtractionPrompt(
  triggerMessage: string,
  context: ConversationMessage[],
  useOnlyPrevious: boolean,
): string {
  const contextMessages = useOnlyPrevious
    ? context.slice(-1)
    : context;

  const contextBlock = contextMessages.length
    ? contextMessages
        .map((m) => `[${m.sender}]: ${m.text}`)
        .join('\n')
    : '(no prior context)';

  return `You are an AI assistant that processes WhatsApp messages for a task management bot called Maradona.

Recent conversation context:
${contextBlock}

Current message (the trigger):
${triggerMessage}

Analyze the message and return ONLY valid JSON with this exact structure:
{
  "intent": "task" | "save" | "voice_task" | "voice_save" | "file_save",
  "is_task": boolean,
  "title": string | null,
  "assignee_name": string | null,
  "due_date_text": string | null,
  "use_previous_message_only": boolean,
  "needs_clarification": boolean,
  "clarification_question": string | null
}

Intent rules:
- intent: "task" — user wants to create a task/todo from text
- intent: "save" — user wants to save/summarize text messages to Basecamp (e.g. "toparla ve kaydet", "üstteki mesajı kaydet")
- intent: "voice_task" — context contains [SESLİ MESAJ] and user says "görev çıkar", "görevleri çıkar", "extract tasks", "task"
- intent: "voice_save" — context contains [SESLİ MESAJ] and user says "kaydet", "transcript kaydet", "save", "dinle"
- intent: "file_save" — context contains [DOSYA] or [RESİM] and user says "kaydet", "yükle", "save", "upload"
- intent: "create_list" — user says "yeni liste oluştur", "liste aç", "create list", "new list" (followed by a list name)
- intent: "reset_list" — user says "liste sıfırla", "varsayılan liste", "reset list", "default list"
- intent: "help" — user says "yardım", "komutlar", "help", "ne yapabilirsin", "nasıl kullanırım"

Task rules (when intent is "task"):
- is_task: true
- title: a concise task title extracted from the message
- assignee_name: the person the task should be assigned to. IMPORTANT: "Maradona" is the trigger keyword — never extract it as assignee_name.
- due_date_text: the raw due date string as mentioned (e.g., "Friday", "cuma", "03.05.2026")
- needs_clarification: true if assignee or title is missing
- If no assignee is mentioned, set needs_clarification to true and clarification_question to "Bu görevi kime atayayım? / Who should I assign this task to?"

Save rules (when intent is "save"):
- is_task: false
- use_previous_message_only: true if user says "üstteki mesajı kaydet" or "save the message above"
- use_previous_message_only: false if user says "toparla ve kaydet" or "summarize and save"
- title: concise summary of what's being saved
- assignee_name: null
- needs_clarification: false

Help rules (when intent is "help"):
- is_task: false
- title: null
- needs_clarification: false

List rules (when intent is "create_list"):
- is_task: false
- title: the list name the user specified
- assignee_name: null
- needs_clarification: true if no list name given, clarification_question: "Liste adı nedir? / What is the list name?"
- needs_clarification: false if list name is clear

Reset rules (when intent is "reset_list"):
- is_task: false
- title: null
- needs_clarification: false

Voice/File rules (when intent is "voice_task", "voice_save", or "file_save"):
- is_task: false
- assignee_name: null
- title: null
- needs_clarification: false
- use_previous_message_only: false

Respond in the same language the user used (Turkish or English).
Return ONLY the JSON object, no markdown, no explanation.`;
}
