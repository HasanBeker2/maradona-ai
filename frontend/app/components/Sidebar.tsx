'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/dashboard', label: '📊 Özet' },
  { href: '/dashboard/messages', label: '💬 Mesajlar' },
  { href: '/dashboard/tasks', label: '✅ Görevler' },
  { href: '/dashboard/summaries', label: '📋 Özetler' },
  { href: '/dashboard/groups', label: '👥 Gruplar' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-lg font-bold text-green-600">Maradona AI</span>
      </div>
      <nav className="flex-1 py-4">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-colors ${
              pathname === item.href
                ? 'bg-green-50 text-green-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
