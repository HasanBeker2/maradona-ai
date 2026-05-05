'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGroups, getSummaries } from '@/lib/api';

export default function SummariesPage() {
  const [selectedGroup, setSelectedGroup] = useState('');
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: getGroups });
  const { data: summaries, isLoading } = useQuery({
    queryKey: ['summaries', selectedGroup],
    queryFn: () => getSummaries(selectedGroup),
    enabled: !!selectedGroup,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Haftalık Özetler</h1>
      <div className="mb-4">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}>
          <option value="">Grup seçin...</option>
          {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {!selectedGroup && <p className="text-gray-400 text-sm">Özetleri görmek için bir grup seçin.</p>}
      {isLoading && <div className="text-gray-400">Yükleniyor...</div>}

      <div className="space-y-4">
        {summaries?.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-semibold text-sm">
                {new Date(s.week_start).toLocaleDateString('tr-TR')} – {new Date(s.week_end).toLocaleDateString('tr-TR')}
              </span>
              {s.sent_at
                ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Gönderildi</span>
                : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Gönderilmedi</span>
              }
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.summary_text}</p>
          </div>
        ))}
        {summaries?.length === 0 && <p className="text-gray-400 text-sm">Bu grup için henüz özet oluşturulmadı.</p>}
      </div>
    </div>
  );
}
