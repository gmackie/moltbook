import type { RpcHandler } from '../types/openclaw.js';
import type { MemoryService } from '../services/memory.js';

export function createMemoryStatsRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    respond(true, { stats: memory.getStats() });
  };
}

export function createMemoryConversationsRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    const conversations = memory.getConversations();
    respond(true, { conversations, count: conversations.length });
  };
}

export function createMemoryContentRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    const content = memory.getContent();
    respond(true, { content, count: content.length });
  };
}

export function createMemoryRelationshipsRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    const stats = memory.getStats();
    respond(true, { relationshipCount: stats.relationshipCount });
  };
}
