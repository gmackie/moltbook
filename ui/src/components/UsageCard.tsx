import type { StatusResponse } from '../api/types';

interface Props {
  usage: StatusResponse['usage'];
  budgets?: { postsPerDay: number; commentsPerDay: number };
}

export function UsageCard({ usage, budgets }: Props) {
  const postPct = budgets ? (usage.postsToday / budgets.postsPerDay) * 100 : 0;
  const commentPct = budgets ? (usage.commentsToday / budgets.commentsPerDay) * 100 : 0;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Rate Limits & Usage</h2>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Posts</span>
            <span className="font-mono">{usage.postsToday}{budgets && ` / ${budgets.postsPerDay}`}</span>
          </div>
          {budgets && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${postPct > 80 ? 'bg-red-500' : postPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(postPct, 100)}%` }}
              />
            </div>
          )}
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Comments</span>
            <span className="font-mono">{usage.commentsToday}{budgets && ` / ${budgets.commentsPerDay}`}</span>
          </div>
          {budgets && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${commentPct > 80 ? 'bg-red-500' : commentPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(commentPct, 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <span className={`px-2 py-1 rounded text-xs ${
            usage.canPost ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            {usage.canPost ? 'Can Post' : 'Rate Limited'}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${
            usage.canComment ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            {usage.canComment ? 'Can Comment' : 'Rate Limited'}
          </span>
        </div>

        {(usage.nextPostAvailable || usage.nextCommentAvailable) && (
          <div className="text-xs text-gray-400 pt-2">
            {usage.nextPostAvailable && (
              <p>Next post: {new Date(usage.nextPostAvailable).toLocaleTimeString()}</p>
            )}
            {usage.nextCommentAvailable && (
              <p>Next comment: {new Date(usage.nextCommentAvailable).toLocaleTimeString()}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
