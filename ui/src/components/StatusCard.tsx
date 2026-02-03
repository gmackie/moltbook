import type { StatusResponse } from '../api/types';

interface Props {
  status: StatusResponse;
}

export function StatusCard({ status }: Props) {
  const stateColors = {
    idle: 'bg-green-900 text-green-300',
    browsing: 'bg-blue-900 text-blue-300',
    posting: 'bg-purple-900 text-purple-300',
    rate_limited: 'bg-red-900 text-red-300',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Agent Status</h2>
      {status.agent ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            {status.agent.avatarUrl && (
              <img
                src={status.agent.avatarUrl}
                alt={status.agent.name}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <p className="text-xl font-bold">{status.agent.name}</p>
              <p className="text-gray-400 text-sm">{status.agent.description}</p>
            </div>
          </div>
          <div className="mt-4">
            <span className={`inline-block px-3 py-1 rounded-full text-sm ${stateColors[status.state]}`}>
              {status.state.replace('_', ' ')}
            </span>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-red-400">Not connected</p>
          {status.error && (
            <p className="text-red-300 text-sm mt-2">{status.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
