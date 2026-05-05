import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ClaudeTaskExtraction, ConversationMessage, VoiceTaskExtraction } from '../types/task';
import { buildTaskExtractionPrompt } from '../prompts/taskExtraction';
import { buildVoiceTaskExtractionPrompt } from '../prompts/voiceTaskExtraction';
import { buildWeeklySummaryPrompt } from '../prompts/weeklySummary';
import { logger } from '../utils/logger';

const client = new Anthropic();

const ExtractionSchema = z.object({
  intent: z.enum(['task', 'save', 'voice_task', 'voice_save', 'file_save', 'create_list', 'reset_list', 'help']).default('task'),
  is_task: z.boolean(),
  title: z.string().nullable(),
  assignee_name: z.string().nullable(),
  due_date_text: z.string().nullable(),
  project: z.string().nullable().default(null),
  use_previous_message_only: z.boolean(),
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable(),
});

export async function extractTask(
  triggerMessage: string,
  context: ConversationMessage[],
  useOnlyPrevious = false,
): Promise<ClaudeTaskExtraction> {
  const prompt = buildTaskExtractionPrompt(triggerMessage, context, useOnlyPrevious);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: 'You extract task data from WhatsApp messages. Return only valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0];
  if (raw?.type !== 'text') throw new Error('Unexpected Claude response type');

  const text = raw.text.trim();
  logger.debug({ text }, 'Claude raw response');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Claude response');

  const parsed = JSON.parse(jsonMatch[0]);
  return ExtractionSchema.parse(parsed) as ClaudeTaskExtraction;
}

const VoiceTaskSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      assignee_name: z.string().nullable(),
      due_date_text: z.string().nullable(),
    }),
  ),
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable(),
});

export async function extractTasksFromTranscript(transcript: string): Promise<VoiceTaskExtraction> {
  const prompt = buildVoiceTaskExtractionPrompt(transcript);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You extract tasks from voice message transcripts. Return only valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0];
  if (raw?.type !== 'text') throw new Error('Unexpected Claude response type');

  const jsonMatch = raw.text.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Claude response');

  return VoiceTaskSchema.parse(JSON.parse(jsonMatch[0]));
}

export async function generateWeeklySummary(
  messages: Array<{ sender_name: string; body: string; timestamp: Date }>,
  groupName: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<string> {
  const prompt = buildWeeklySummaryPrompt(groupName, weekStart, weekEnd, messages);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: 'You generate weekly summaries for WhatsApp project groups. Be concise and use WhatsApp-compatible formatting (*bold*, _italic_).',
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0];
  if (raw?.type !== 'text') throw new Error('Unexpected Claude response type');

  return raw.text.trim();
}
