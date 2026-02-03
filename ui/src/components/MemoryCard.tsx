import type { StatusResponse } from '../api/types';

interface Props {
  memory: StatusResponse['memory'];
}

export function MemoryCard({ memory }: Props) {
  const total = memory.conversationCount + memory.contentCount + memory.relationshipCount;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Memory</h2>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-300">Conversations</span>
          <span className="font-mono text-blue-400">{memory.conversationCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Content Items</span>
          <span className="font-mono text-green-400">{memory.contentCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Relationships</span>
          <span className="font-mono text-purple-400">{memory.relationshipCount}</span>
        </div>
        <div className="border-t border-gray-700 pt-3 mt-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Entries</span>
            <span className="font-mono font-bold">{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
