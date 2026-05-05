import cron from 'node-cron';
import { listActiveGroups, getMessagesForPeriod, insertSummary, markSummarySent } from './mapping';
import { generateWeeklySummary } from './claude';
import { sendToGroup } from './whatsappClient';
import { logger } from '../utils/logger';

function getLastMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

async function generateAndSendWeeklySummaries(): Promise<void> {
  logger.info('Running weekly summary generation');
  const groups = await listActiveGroups();
  const weekStart = getLastMonday();
  const weekEnd = new Date();

  for (const group of groups) {
    try {
      const messages = await getMessagesForPeriod(group.id, weekStart, weekEnd);
      if (messages.length === 0) {
        logger.info({ groupId: group.id, name: group.name }, 'No messages this week — skipping summary');
        continue;
      }

      const summaryText = await generateWeeklySummary(
        messages.map((m) => ({ sender_name: m.sender_name, body: m.body, timestamp: new Date(m.timestamp) })),
        group.name,
        weekStart,
        weekEnd,
      );

      const summary = await insertSummary({
        groupId: group.id,
        weekStart,
        weekEnd,
        summaryText,
      });

      await sendToGroup(group.chat_id, summaryText);
      await markSummarySent(summary.id);
      logger.info({ groupId: group.id, name: group.name }, 'Weekly summary sent');
    } catch (err) {
      logger.error({ err, groupId: group.id }, 'Failed to generate/send weekly summary');
    }
  }
}

export function startScheduler(): void {
  const schedule = process.env.SUMMARY_CRON ?? '0 20 * * 0';
  const timezone = process.env.TZ ?? 'Europe/Istanbul';

  cron.schedule(schedule, generateAndSendWeeklySummaries, { timezone });
  logger.info({ schedule, timezone }, 'Weekly summary scheduler started');
}

// For manual/test triggering
export { generateAndSendWeeklySummaries };
