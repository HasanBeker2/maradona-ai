'use client';
import { useQuery } from '@tanstack/react-query';
import { getLogs } from '@/lib/api';
import type { LogEntry } from '@/lib/api';

const LEVEL_STYLES: Record<string, string> = {
  fatal: 'text-red-700 bg-red-50 border-red-200',
  error: 'text-red-600 bg-red-50 border-red-100',
  warn: 'text-yellow-700 bg-yellow-50 border-yellow-100',
  info: 'text-gray-600 bg-white border-gray-100',
  debug: 'text-gray-400 bg-gray-50 border-gray-100',
  trace: 'text-gray-300 bg-gray-50 border-gray-100',
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function LogRow({ entry }: { entry: LogEntry }) {
  const level = entry.levelLabel ?? 'info';
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES.info;
  const { level: _l, levelLabel: _ll, time: _t, msg: _m, ...extra } = entry;

  const hasExtra = Object.keys(extra).length > 0;

  return (
    <div className={`border-b px-4 py-2.5 text-sm font-mono ${style}`}>
      <div className="flex items-start gap-3">
        <span className="text-xs opacity-50 shrink-0 pt-0.5">{formatTime(entry.time)}</span>
        <span className={`text-xs font-bold uppercase shrink-0 pt-0.5 w-10 ${
          level === 'error' || level === 'fatal' ? 'text-red-600' :
          level === 'warn' ? 'text-yellow-600' : 'opacity-40'
        }`}>{level}</span>
        <div className="flex-1 min-w-0">
          <span>{entry.msg}</span>
          {hasExtra && (
            <details className="mt-1">
              <summary className="text-xs opacity-40 cursor-pointer hover:opacity-60">details</summary>
              <pre className="text-xs mt-1 opacity-60 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(extra, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LogsPage() {
  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs'],
    queryFn: getLogs,
    refetchInterval: 5000,
  });

  const errorCount = logs?.filter((l) => l.levelLabel === 'error' || l.levelLabel === 'fatal').length ?? 0;
  const warnCount = logs?.filter((l) => l.levelLabel === 'warn').length ?? 0;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Last 200 entries · auto-refreshes every 5s</p>
        </div>
        <div className="flex items-center gap-3">
          {errorCount > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isFetching ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading logs...</div>
        ) : !logs?.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">No logs yet</div>
        ) : (
          <div className="divide-y-0">
            {logs.map((entry, i) => (
              <LogRow key={i} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
