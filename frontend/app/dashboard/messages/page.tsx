'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGroups, getMessages } from '@/lib/api';

export default function MessagesPage() {
  const [selectedGroup, setSelectedGroup] = useState('');
  const [page, setPage] = useState(1);

  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: getGroups });
  const { data, isLoading } = useQuery({
    queryKey: ['messages', selectedGroup, page],
    queryFn: () => getMessages(selectedGroup, page),
    enabled: !!selectedGroup,
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Mesajlar</h1>
      <div className="mb-4">
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={selectedGroup}
          onChange={(e) => { setSelectedGroup(e.target.value); setPage(1); }}
        >
          <option value="">Grup seçin...</option>
          {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {!selectedGroup && <p className="text-gray-400 text-sm">Mesajları görmek için bir grup seçin.</p>}

      {isLoading && <div className="text-gray-400">Yükleniyor...</div>}

      {data && (
        <>
          <div className="text-sm text-gray-500 mb-3">Toplam: {data.total} mesaj</div>
          <div className="space-y-2">
            {data.messages.map((m) => (
              <div key={m.id} className={`bg-white rounded-lg border px-4 py-3 ${m.has_trigger ? 'border-green-400' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{m.sender_name}</span>
                  {m.has_trigger && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">@Maradona</span>}
                  <span className="text-xs text-gray-400 ml-auto">{new Date(m.timestamp).toLocaleString('tr-TR')}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40">Önceki</button>
            <span className="text-sm text-gray-500 px-2 py-1">Sayfa {page}</span>
            <button disabled={data.messages.length < data.limit} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40">Sonraki</button>
          </div>
        </>
      )}
    </div>
  );
}
