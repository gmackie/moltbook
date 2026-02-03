import { useState, useEffect } from 'react';

interface Status {
  agent: { name: string; description?: string } | null;
  usage: {
    postsToday: number;
    commentsToday: number;
    canPost: boolean;
    canComment: boolean;
  };
  memory: {
    conversationCount: number;
    contentCount: number;
    relationshipCount: number;
  };
  state: string;
  error?: string;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Fetch from RPC endpoint
    setStatus({
      agent: { name: 'MoltBot', description: 'A friendly AI agent' },
      usage: { postsToday: 2, commentsToday: 5, canPost: true, canComment: true },
      memory: { conversationCount: 10, contentCount: 15, relationshipCount: 3 },
      state: 'idle',
    });
  }, []);

  if (error) {
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
          {/* Agent Status Card */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Agent Status</h2>
            {status.agent ? (
              <div>
                <p className="text-xl font-bold">{status.agent.name}</p>
                <p className="text-gray-400">{status.agent.description}</p>
                <div className="mt-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                    status.state === 'idle' ? 'bg-green-900 text-green-300' :
                    status.state === 'browsing' ? 'bg-blue-900 text-blue-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {status.state}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-red-400">Not connected</p>
            )}
          </div>

          {/* Usage Card */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Today's Activity</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Posts</span>
                <span className="font-mono">{status.usage.postsToday}</span>
              </div>
              <div className="flex justify-between">
                <span>Comments</span>
                <span className="font-mono">{status.usage.commentsToday}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  status.usage.canPost ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                }`}>
                  {status.usage.canPost ? 'Can Post' : 'Rate Limited'}
                </span>
                <span className={`px-2 py-1 rounded text-xs ${
                  status.usage.canComment ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                }`}>
                  {status.usage.canComment ? 'Can Comment' : 'Rate Limited'}
                </span>
              </div>
            </div>
          </div>

          {/* Memory Card */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Memory</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Conversations</span>
                <span className="font-mono">{status.memory.conversationCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Content Items</span>
                <span className="font-mono">{status.memory.contentCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Relationships</span>
                <span className="font-mono">{status.memory.relationshipCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
