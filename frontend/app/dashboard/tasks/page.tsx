'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTasks } from '@/lib/api';

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    synced: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  };
  const labels: Record<string, string> = { synced: 'Eklendi', failed: 'Hata', pending: 'Bekliyor' };
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[status] ?? ''}`}>{labels[status] ?? status}</span>;
};

export default function TasksPage() {
  const [status, setStatus] = useState('');

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', status],
    queryFn: () => getTasks(undefined, status || undefined),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Görevler</h1>
      <div className="mb-4">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tüm durumlar</option>
          <option value="synced">Basecamp'e Eklendi</option>
          <option value="pending">Bekliyor</option>
          <option value="failed">Hata</option>
        </select>
      </div>

      {isLoading && <div className="text-gray-400">Yükleniyor...</div>}

      <div className="space-y-2">
        {tasks?.map((t) => (
          <div key={t.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm">{t.title}</span>
                  {statusBadge(t.sync_status)}
                </div>
                <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                  {t.assignee && <span>👤 {t.assignee}</span>}
                  {t.deadline && <span>📅 {new Date(t.deadline).toLocaleDateString('tr-TR')}</span>}
                  {t.project && <span>📁 {t.project}</span>}
                  <span>🏠 {t.group_name}</span>
                </div>
              </div>
              {t.basecamp_url && (
                <a href={t.basecamp_url} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline shrink-0">Basecamp →</a>
              )}
            </div>
          </div>
        ))}
        {tasks?.length === 0 && <p className="text-gray-400 text-sm">Görev bulunamadı.</p>}
      </div>
    </div>
  );
}
