import axios from 'axios';
import type { BasecampTodo } from '../types/task';
import { logger } from '../utils/logger';
import { getSetting } from './mapping';

const BASE_URL = 'https://3.basecampapi.com';

async function getAccessToken(): Promise<string> {
  const dbToken = await getSetting('basecamp_access_token').catch(() => null);
  return dbToken ?? process.env.BASECAMP_ACCESS_TOKEN ?? '';
}

async function getHeaders() {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Maradona Bot (contact@yourdomain.com)',
  };
}

export async function createTodolist(name: string): Promise<{ id: number; app_url: string }> {
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const projectId = process.env.BASECAMP_PROJECT_ID;

  const projectUrl = `${BASE_URL}/${accountId}/projects/${projectId}.json`;
  const { data: project } = await axios.get(projectUrl, { headers: await getHeaders() });
  const todoset = (project.dock as Array<{ name: string; id: number }>).find(
    (d) => d.name === 'todoset',
  );
  if (!todoset) throw new Error('No todoset found in Basecamp project');

  const url = `${BASE_URL}/${accountId}/buckets/${projectId}/todosets/${todoset.id}/todolists.json`;
  const { data } = await axios.post(url, { name }, { headers: await getHeaders() });
  logger.info({ name, id: data.id }, 'Basecamp todolist created');
  return { id: data.id, app_url: data.app_url };
}

export async function createTodo(params: {
  title: string;
  assigneeId?: string;
  dueOn?: string | null;
  description?: string;
  todolistId?: string;
}): Promise<BasecampTodo> {
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const projectId = process.env.BASECAMP_PROJECT_ID;
  const todolistId = params.todolistId ?? process.env.BASECAMP_TODOLIST_ID;

  const url = `${BASE_URL}/${accountId}/buckets/${projectId}/todolists/${todolistId}/todos.json`;

  const body: Record<string, unknown> = {
    content: params.title,
  };
  if (params.assigneeId) body['assignee_ids'] = [params.assigneeId];
  if (params.dueOn) body['due_on'] = params.dueOn;
  if (params.description) body['description'] = params.description;

  logger.info({ url, body }, 'Creating Basecamp todo');

  const { data } = await axios.post<BasecampTodo>(url, body, {
    headers: await getHeaders(),
  });

  return data;
}

export async function addComment(
  projectId: string,
  todoId: number,
  content: string,
): Promise<void> {
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const url = `${BASE_URL}/${accountId}/buckets/${projectId}/recordings/${todoId}/comments.json`;

  await axios.post(url, { content }, { headers: await getHeaders() });
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ app_url: string; title: string }> {
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const projectId = process.env.BASECAMP_PROJECT_ID;

  // Step 1: upload attachment to get sgid
  const attachUrl = `${BASE_URL}/${accountId}/attachments.json?name=${encodeURIComponent(filename)}`;
  const { data: attachment } = await axios.post(attachUrl, buffer, {
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': mimeType,
      'User-Agent': 'Maradona Bot (contact@yourdomain.com)',
    },
  });
  const sgid: string = attachment.attachable_sgid;

  // Step 2: find vault ID from project
  const projectUrl = `${BASE_URL}/${accountId}/projects/${projectId}.json`;
  const { data: project } = await axios.get(projectUrl, { headers: await getHeaders() });
  const vault = (project.dock as Array<{ name: string; id: number }>).find(
    (d) => d.name === 'vault',
  );
  if (!vault) throw new Error('No vault found in Basecamp project');

  // Step 3: create document in vault
  const docUrl = `${BASE_URL}/${accountId}/buckets/${projectId}/vaults/${vault.id}/documents.json`;
  const content = `<bc-attachment sgid="${sgid}"></bc-attachment>`;
  const { data: doc } = await axios.post(
    docUrl,
    { title: filename, content, status: 'active' },
    { headers: await getHeaders() },
  );

  logger.info({ filename, app_url: doc.app_url }, 'File uploaded to Basecamp vault');
  return { app_url: doc.app_url, title: filename };
}
