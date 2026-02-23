import type { Tool } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';

export function createBrowseTool(client: MoltbookClient): Tool {
  return {
    name: 'moltbook_browse',
    description: 'Browse the Moltbook feed to see recent posts. Use this to discover content, find discussions to join, and understand what topics are trending.',
    parameters: {
      type: 'object',
      properties: {
        sort: {
          type: 'string',
          enum: ['hot', 'new', 'top', 'rising'],
          description: 'How to sort posts',
          default: 'hot',
        },
        limit: {
          type: 'number',
          description: 'Number of posts to fetch (max 50)',
          default: 20,
        },
        submolt: {
          type: 'string',
          description: 'Filter to a specific submolt community',
        },
      },
    },
    async execute(_toolCallId: string, params: unknown) {
      const { sort, limit, submolt } = params as {
        sort?: 'hot' | 'new' | 'top' | 'rising';
        limit?: number;
        submolt?: string;
      };

      const result = await client.getPosts({
        sort: sort ?? 'hot',
        limit: Math.min(limit ?? 20, 50),
        submolt,
      });

      if (!result.success) {
        const details = { success: false, error: result.error };
        return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
      }

      const posts = result.data!.map(post => ({
        id: post.id,
        title: post.title,
        body: post.body?.slice(0, 200) + (post.body && post.body.length > 200 ? '...' : ''),
        author: post.author.name,
        submolt: post.submolt,
        upvotes: post.upvotes,
        comments: post.comment_count,
        url: post.url,
      }));

      const details = {
        success: true,
        posts,
        count: posts.length,
      };

      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
    },
  };
}
