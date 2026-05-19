'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { getStats, getWhatsAppStatus, resetWhatsApp, getBasecampStatus } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function BasecampToast({ show, type }: { show: boolean; type: string }) {
  if (!show) return null;
  const isSuccess = type === 'connected';
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
      isSuccess ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
    }`}>
      {isSuccess ? '✓ Basecamp connected successfully' : '✗ Basecamp connection failed'}
    </div>
  );
}

function DashboardContent() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const basecampParam = searchParams.get('basecamp');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (basecampParam) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [basecampParam]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  });

  const { data: waStatus, isLoading: waLoading } = useQuery({
    queryKey: ['wa-status'],
    queryFn: getWhatsAppStatus,
    refetchInterval: 5000,
  });

  const { data: bcStatus } = useQuery({
    queryKey: ['bc-status'],
    queryFn: getBasecampStatus,
  });

  const resetMutation = useMutation({
    mutationFn: resetWhatsApp,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-status'] }),
  });

  const statCards = [
    { label: 'Active Groups', value: stats?.total_groups ?? 0, color: 'bg-green-50 text-green-700 border-green-100' },
    { label: 'Total Messages', value: stats?.total_messages ?? 0, color: 'bg-blue-50 text-blue-700 border-blue-100' },
    { label: 'Total Tasks', value: stats?.total_tasks ?? 0, color: 'bg-purple-50 text-purple-700 border-purple-100' },
    { label: 'Synced', value: stats?.synced_tasks ?? 0, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: 'Failed', value: stats?.failed_tasks ?? 0, color: 'bg-red-50 text-red-700 border-red-100' },
  ];

  const waStatusConfig = {
    ready: { label: 'Connected', dot: 'bg-green-500', badge: 'text-green-700 bg-green-50 border-green-200' },
    qr: { label: 'Awaiting QR Scan', dot: 'bg-yellow-500', badge: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
    disconnected: { label: 'Disconnected', dot: 'bg-red-500', badge: 'text-red-700 bg-red-50 border-red-200' },
    initializing: { label: 'Initializing...', dot: 'bg-gray-400', badge: 'text-gray-600 bg-gray-50 border-gray-200' },
  };

  const wa = waStatusConfig[waStatus?.status ?? 'initializing'];

  return (
    <div className="max-w-5xl">
      <BasecampToast show={showToast} type={basecampParam ?? ''} />

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statsLoading
          ? Array(5).fill(0).map((_, i) => (
              <div key={i} className="rounded-xl p-5 bg-gray-50 border border-gray-100 animate-pulse h-20" />
            ))
          : statCards.map((c) => (
              <div key={c.label} className={`rounded-xl p-5 border ${c.color}`}>
                <div className="text-3xl font-bold">{c.value}</div>
                <div className="text-sm mt-1 opacity-75">{c.label}</div>
              </div>
            ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* WhatsApp Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">WhatsApp</h2>

          {waLoading ? (
            <div className="h-8 bg-gray-100 rounded animate-pulse w-32" />
          ) : (
            <div className="space-y-4">
              <div className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border ${wa.badge}`}>
                <span className={`w-2 h-2 rounded-full ${wa.dot}`} />
                {wa.label}
              </div>

              {waStatus?.qr && (
                <div className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl border">
                  <p className="text-xs text-gray-500">Scan with WhatsApp to connect</p>
                  <img src={waStatus.qr} alt="WhatsApp QR Code" className="w-48 h-48" />
                </div>
              )}

              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="w-full text-sm font-medium py-2 px-4 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors"
              >
                {resetMutation.isPending ? 'Resetting...' : '🔄 Reset WhatsApp'}
              </button>
              <p className="text-xs text-gray-400">Use this if WhatsApp is stuck or shows errors</p>
            </div>
          )}
        </div>

        {/* Basecamp Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Basecamp</h2>

          <div className="space-y-4">
            {bcStatus?.connected ? (
              <div className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border text-green-700 bg-green-50 border-green-200">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Connected
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border text-gray-600 bg-gray-50 border-gray-200">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Not Connected
              </div>
            )}

            <a
              href={`${API_BASE}/auth/basecamp`}
              className="block w-full text-center text-sm font-medium py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              {bcStatus?.connected ? '🔄 Reconnect Basecamp' : '🔗 Connect Basecamp'}
            </a>
            <p className="text-xs text-gray-400">
              Connect your Basecamp account to enable task creation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
