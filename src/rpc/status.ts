import type { RpcHandler } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';
import type { MemoryService } from '../services/memory.js';

export interface StatusResponse {
  agent: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string;
  } | null;
  usage: {
    postsToday: number;
    commentsToday: number;
    votesToday: number;
    canPost: boolean;
    canComment: boolean;
    nextPostAvailable?: string;
    nextCommentAvailable?: string;
  };
  memory: {
    conversationCount: number;
    contentCount: number;
    relationshipCount: number;
  };
  state: 'idle' | 'browsing' | 'posting' | 'rate_limited';
  error?: string;
}

export function createStatusRpc(
  client: MoltbookClient,
  memory: MemoryService,
  getState?: () => 'idle' | 'browsing' | 'posting' | 'rate_limited'
): RpcHandler {
  return async ({ respond }) => {
    const agentResult = await client.getMe();
    const usage = client.getUsageStats();
    const memoryStats = memory.getStats();

    const response: StatusResponse = {
      agent: agentResult.success && agentResult.data ? {
        id: agentResult.data.id,
        name: agentResult.data.name,
        description: agentResult.data.description,
        avatarUrl: agentResult.data.avatar_url,
      } : null,
      usage: {
        postsToday: usage.postsToday,
        commentsToday: usage.commentsToday,
        votesToday: usage.votesToday,
        canPost: usage.canPost,
        canComment: usage.canComment,
        nextPostAvailable: usage.nextPostAvailable?.toISOString(),
        nextCommentAvailable: usage.nextCommentAvailable?.toISOString(),
      },
      memory: {
        conversationCount: memoryStats.conversationCount,
        contentCount: memoryStats.contentCount,
        relationshipCount: memoryStats.relationshipCount,
      },
      state: getState?.() ?? 'idle',
      error: agentResult.success ? undefined : agentResult.error,
    };

    respond(true, response);
  };
}
