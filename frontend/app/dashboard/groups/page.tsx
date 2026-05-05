'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGroups, addGroup, sendPrivacyNotice } from '@/lib/api';

export default function GroupsPage() {
  const qc = useQueryClient();
  const [chatId, setChatId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: groups, isLoading } = useQuery({ queryKey: ['groups'], queryFn: getGroups });

  const addMutation = useMutation({
    mutationFn: () => addGroup(chatId, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setChatId(''); setName(''); setError(''); },
    onError: () => setError('Grup eklenemedi. Chat ID ve isim kontrol edin.'),
  });

  const noticeMutation = useMutation({
    mutationFn: (id: string) => sendPrivacyNotice(id),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Gruplar</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-sm mb-3">Yeni Grup Ekle</h2>
        <div className="flex gap-2 flex-wrap">
          <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
            placeholder="Chat ID (örn: 120363xxxxxx@g.us)" value={chatId}
            onChange={(e) => setChatId(e.target.value)} />
          <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
            placeholder="Grup adı" value={name}
            onChange={(e) => setName(e.target.value)} />
          <button onClick={() => addMutation.mutate()}
            disabled={!chatId || !name || addMutation.isPending}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {addMutation.isPending ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        <p className="text-xs text-gray-400 mt-2">
          Chat ID'yi öğrenmek için Maradona botunun olduğu gruba herhangi bir mesaj gönderin ve backend loglarını kontrol edin.
        </p>
      </div>

      {isLoading && <div className="text-gray-400">Yükleniyor...</div>}

      <div className="space-y-2">
        {groups?.map((g) => (
          <div key={g.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium text-sm">{g.name}</div>
              <div className="text-xs text-gray-400 font-mono">{g.chat_id}</div>
            </div>
            <div className="flex items-center gap-2">
              {g.privacy_notice_sent
                ? <span className="text-xs text-green-600">✓ Gizlilik bildirimi gönderildi</span>
                : <span className="text-xs text-gray-400">Bildirim gönderilmedi</span>
              }
              <button onClick={() => noticeMutation.mutate(g.id)}
                className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                disabled={noticeMutation.isPending}>
                Bildirimi Gönder
              </button>
              <span className={`text-xs px-2 py-0.5 rounded ${g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {g.is_active ? 'Aktif' : 'Pasif'}
              </span>
            </div>
          </div>
        ))}
        {groups?.length === 0 && <p className="text-gray-400 text-sm">Henüz grup eklenmedi.</p>}
      </div>
    </div>
  );
}
