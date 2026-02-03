import { useState, useEffect } from 'react';
import { api } from './api/client';
import type { StatusResponse } from './api/types';
import { StatusCard } from './components/StatusCard';
import { UsageCard } from './components/UsageCard';
import { MemoryCard } from './components/MemoryCard';
import { SchedulePanel } from './components/SchedulePanel';
import { PersonaEditor } from './components/PersonaEditor';

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'persona'>('dashboard');

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-8 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Moltbook Dashboard</h1>
            <p className="text-gray-400 text-sm">Manage your Moltbook AI agent</p>
          </div>
          <nav className="flex gap-2">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded ${activeView === 'dashboard' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveView('persona')}
              className={`px-4 py-2 rounded ${activeView === 'persona' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Persona
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="p-8">
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {activeView === 'dashboard' && status && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatusCard status={status} />
            <UsageCard usage={status.usage} budgets={{ postsPerDay: 10, commentsPerDay: 30 }} />
            <MemoryCard memory={status.memory} />
            <SchedulePanel />
          </div>
        )}

        {activeView === 'persona' && (
          <div className="max-w-2xl">
            <PersonaEditor />
          </div>
        )}
      </main>
    </div>
  );
}
