'use client';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '@/lib/api';

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: getStats });

  if (isLoading) return <div className="text-gray-400">Yükleniyor...</div>;

  const cards = [
    { label: 'Aktif Grup', value: stats?.total_groups ?? 0, color: 'bg-green-100 text-green-700' },
    { label: 'Toplam Mesaj', value: stats?.total_messages ?? 0, color: 'bg-blue-100 text-blue-700' },
    { label: 'Toplam Görev', value: stats?.total_tasks ?? 0, color: 'bg-purple-100 text-purple-700' },
    { label: 'Basecamp\'e Eklendi', value: stats?.synced_tasks ?? 0, color: 'bg-emerald-100 text-emerald-700' },
    { label: 'Başarısız', value: stats?.failed_tasks ?? 0, color: 'bg-red-100 text-red-700' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl p-5 ${c.color}`}>
            <div className="text-3xl font-bold">{c.value}</div>
            <div className="text-sm mt-1 opacity-75">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
