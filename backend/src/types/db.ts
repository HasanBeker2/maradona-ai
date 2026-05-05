export interface Group {
  id: string;
  chat_id: string;
  name: string;
  is_active: boolean;
  privacy_notice_sent: boolean;
  created_at: Date;
}

export interface Message {
  id: string;
  group_id: string;
  sender_name: string;
  sender_phone: string | null;
  body: string;
  timestamp: Date;
  has_trigger: boolean;
  created_at: Date;
}

export interface Task {
  id: string;
  message_id: string;
  title: string;
  assignee: string | null;
  deadline: Date | null;
  project: string | null;
  notes: string | null;
  basecamp_todo_id: string | null;
  basecamp_url: string | null;
  sync_status: 'pending' | 'synced' | 'failed';
  created_at: Date;
}

export interface WeeklySummary {
  id: string;
  group_id: string;
  week_start: Date;
  week_end: Date;
  summary_text: string;
  sent_at: Date | null;
  created_at: Date;
}

export interface Stats {
  total_groups: number;
  total_messages: number;
  total_tasks: number;
  synced_tasks: number;
  failed_tasks: number;
}

export interface InsertMessageParams {
  groupId: string;
  senderName: string;
  senderPhone?: string;
  body: string;
  timestamp: Date;
  hasTrigger: boolean;
}

export interface InsertTaskParams {
  messageId: string;
  title: string;
  assignee?: string | null;
  deadline?: string | null;
  project?: string | null;
  notes?: string | null;
  basecampTodoId?: string | null;
  basecampUrl?: string | null;
  syncStatus: string;
}

export interface InsertSummaryParams {
  groupId: string;
  weekStart: Date;
  weekEnd: Date;
  summaryText: string;
}
