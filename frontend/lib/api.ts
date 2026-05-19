export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface Stats {
  total_groups: number;
  total_messages: number;
  total_tasks: number;
  synced_tasks: number;
  failed_tasks: number;
}

export interface Group {
  id: string;
  chat_id: string;
  name: string;
  is_active: boolean;
  privacy_notice_sent: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  group_id: string;
  sender_name: string;
  sender_phone: string | null;
  body: string;
  timestamp: string;
  has_trigger: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  message_id: string;
  title: string;
  assignee: string | null;
  deadline: string | null;
  project: string | null;
  notes: string | null;
  basecamp_todo_id: string | null;
  basecamp_url: string | null;
  sync_status: 'pending' | 'synced' | 'failed';
  group_name: string;
  chat_id: string;
  created_at: string;
}

export interface WeeklySummary {
  id: string;
  group_id: string;
  week_start: string;
  week_end: string;
  summary_text: string;
  sent_at: string | null;
  created_at: string;
}

export interface MessagesResponse {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
}

export interface LogEntry {
  level: number;
  levelLabel: string;
  time: number;
  msg: string;
  [key: string]: unknown;
}

export interface WaStatusResponse {
  status: 'initializing' | 'qr' | 'ready' | 'disconnected';
  qr: string | null;
}

export interface BasecampStatusResponse {
  connected: boolean;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => apiFetch<Stats>('/api/stats');

// ── Groups ────────────────────────────────────────────────────────────────────
export const getGroups = () => apiFetch<Group[]>('/api/groups');
export const addGroup = (chat_id: string, name: string) =>
  apiFetch<Group>('/api/groups', { method: 'POST', body: JSON.stringify({ chat_id, name }) });
export const sendPrivacyNotice = (id: string) =>
  apiFetch(`/api/groups/${id}/privacy-notice`, { method: 'POST' });

// ── Messages ──────────────────────────────────────────────────────────────────
export const getMessages = (groupId: string, page = 1, limit = 50) =>
  apiFetch<MessagesResponse>(`/api/messages?groupId=${groupId}&page=${page}&limit=${limit}`);

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const getTasks = (groupId?: string, status?: string) => {
  const params = new URLSearchParams();
  if (groupId) params.set('groupId', groupId);
  if (status) params.set('status', status);
  return apiFetch<Task[]>(`/api/tasks?${params}`);
};

// ── Summaries ─────────────────────────────────────────────────────────────────
export const getSummaries = (groupId: string) =>
  apiFetch<WeeklySummary[]>(`/api/summaries?groupId=${groupId}`);

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const getWhatsAppStatus = () => apiFetch<WaStatusResponse>('/api/whatsapp/status');
export const resetWhatsApp = () => apiFetch('/api/whatsapp/reset', { method: 'POST', body: '{}' });

// ── Basecamp ──────────────────────────────────────────────────────────────────
export const getBasecampStatus = () => apiFetch<BasecampStatusResponse>('/api/basecamp/status');

// ── Logs ──────────────────────────────────────────────────────────────────────
export const getLogs = () => apiFetch<LogEntry[]>('/api/logs');

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (username: string, password: string) =>
  apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
export const logout = () => apiFetch('/api/auth/logout', { method: 'POST' });
export const getMe = () => apiFetch<{ username: string }>('/api/auth/me');
