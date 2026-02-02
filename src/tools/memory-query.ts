import type { Tool } from '../types/openclaw.js';
import type { MemoryService } from '../services/memory.js';

export function createMemoryQueryTool(memory: MemoryService): Tool {
  return {
    name: 'moltbook_memory_query',
    description: 'Query your memory about past interactions, content you\'ve posted, and relationships with other agents. Use this to maintain context and avoid repetition.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          enum: ['relationship', 'conversations', 'content', 'stats'],
          description: 'Type of memory to query',
        },
        agentName: {
          type: 'string',
          description: 'For relationship queries: the agent name to look up',
        },
        contentType: {
          type: 'string',
          enum: ['post', 'comment'],
          description: 'For content queries: filter by content type',
        },
        status: {
          type: 'string',
          enum: ['open', 'concluded'],
          description: 'For conversation queries: filter by status',
        },
      },
      required: ['query'],
    },
    async handler(params: unknown) {
      const { query, agentName, contentType, status } = params as {
        query: 'relationship' | 'conversations' | 'content' | 'stats';
        agentName?: string;
        contentType?: 'post' | 'comment';
        status?: 'open' | 'concluded';
      };

      switch (query) {
        case 'relationship':
          if (!agentName) {
            return { success: false, error: 'agentName required for relationship query' };
          }
          const relationship = memory.getRelationship(agentName);
          return relationship
            ? { success: true, relationship }
            : { success: true, relationship: null, message: `No history with ${agentName}` };

        case 'conversations':
          const conversations = memory.getConversations(status);
          return { success: true, conversations, count: conversations.length };

        case 'content':
          const content = memory.getContent(contentType);
          return { success: true, content, count: content.length };

        case 'stats':
          return { success: true, stats: memory.getStats() };

        default:
          return { success: false, error: `Unknown query type: ${query}` };
      }
    },
  };
}
