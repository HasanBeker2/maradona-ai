import pino from 'pino';
import { Writable } from 'stream';

export interface LogEntry {
  level: number;
  levelLabel: string;
  time: number;
  msg: string;
  [key: string]: unknown;
}

const MAX_LOGS = 200;
const logBuffer: LogEntry[] = [];

const LEVEL_LABELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

const bufferStream = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    try {
      const entry = JSON.parse(chunk.toString()) as LogEntry;
      entry.levelLabel = LEVEL_LABELS[entry.level] ?? 'info';
      logBuffer.push(entry);
      if (logBuffer.length > MAX_LOGS) logBuffer.shift();
    } catch {
      // ignore non-JSON lines
    }
    callback();
  },
});

export function getRecentLogs(): LogEntry[] {
  return [...logBuffer].reverse();
}

// Always log JSON to buffer stream; also log pretty or JSON to stdout
export const logger = pino(
  { level: process.env.LOG_LEVEL ?? 'info' },
  pino.multistream([
    {
      stream:
        process.env.NODE_ENV !== 'production'
          ? (pino.transport({ target: 'pino-pretty', options: { colorize: true } }) as any)
          : process.stdout,
    },
    { stream: bufferStream },
  ]),
);
