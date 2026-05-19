'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const nav = [
  { href: '/dashboard', label: '📊 Overview', exact: true },
  { href: '/dashboard/messages', label: '💬 Messages' },
  { href: '/dashboard/tasks', label: '✅ Tasks' },
  { href: '/dashboard/summaries', label: '📋 Summaries' },
  { href: '/dashboard/groups', label: '👥 Groups' },
  { href: '/dashboard/logs', label: '🔍 Logs' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    router.push('/login');
  }

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-lg font-bold text-green-600">Maradona AI</span>
        <p className="text-xs text-gray-400 mt-0.5">Dashboard</p>
      </div>
      <nav className="flex-1 py-4">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-green-50 text-green-700 font-medium border-r-2 border-green-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors text-left"
        >
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}
