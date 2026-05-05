export interface ClaudeTaskExtraction {
  intent: 'task' | 'save' | 'voice_task' | 'voice_save' | 'file_save' | 'create_list' | 'reset_list' | 'help';
  is_task: boolean;
  title: string | null;
  assignee_name: string | null;
  due_date_text: string | null;
  project: string | null;
  use_previous_message_only: boolean;
  needs_clarification: boolean;
  clarification_question: string | null;
}

export interface BasecampTodo {
  id: number;
  title: string;
  app_url: string;
  assignee?: { id: number; name: string };
  due_on?: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text: { body: string };
  type: 'text';
}

export interface ConversationMessage {
  sender: string;
  text: string;
  timestamp: number;
  messageId?: string;
  mediaId?: string;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  mimeType?: string;
  filename?: string;
}

export interface VoiceTaskItem {
  title: string;
  assignee_name: string | null;
  due_date_text: string | null;
}

export interface VoiceTaskExtraction {
  tasks: VoiceTaskItem[];
  needs_clarification: boolean;
  clarification_question: string | null;
}

export interface UserMapping {
  id: string;
  nickname: string;
  whatsapp_phone: string;
  basecamp_user_id: string;
  active: boolean;
}

export interface ProjectMapping {
  id: string;
  project_name: string;
  bucket_id: string;
  todolist_id: string;
  active: boolean;
}
