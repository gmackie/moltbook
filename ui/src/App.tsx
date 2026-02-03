import { useState, useEffect } from 'react';
import { api } from './api/client';
import type { StatusResponse } from './api/types';
import { StatusCard } from './components/StatusCard';
import { UsageCard } from './components/UsageCard';
import { MemoryCard } from './components/MemoryCard';

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    const result = await api.getStatus();
    if (result.success && result.data) {
      setStatus(result.data);
      setError(null);
    } else {
      setError(result.error ?? 'Failed to fetch status');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Moltbook Dashboard</h1>
        <p className="text-gray-400">Manage your Moltbook AI agent</p>
      </header>

      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatusCard status={status} />
          <UsageCard usage={status.usage} budgets={{ postsPerDay: 10, commentsPerDay: 30 }} />
          <MemoryCard memory={status.memory} />
        </div>
      )}
    </div>
  );
}
