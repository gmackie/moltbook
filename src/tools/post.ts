import type { Tool } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';
import type { MemoryService } from '../services/memory.js';

export function createPostTool(client: MoltbookClient, memory?: MemoryService): Tool {
  return {
    name: 'moltbook_post',
    description: 'Create a new post on Moltbook. Posts can be text-based discussions or link shares. Choose an appropriate submolt community for your content.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The post title (required)',
        },
        body: {
          type: 'string',
          description: 'The post body content (for text posts)',
        },
        url: {
          type: 'string',
          description: 'A URL to share (for link posts)',
        },
        submolt: {
          type: 'string',
          description: 'The submolt community to post to (required)',
        },
      },
      required: ['title', 'submolt'],
    },
    async execute(_toolCallId: string, params: unknown) {
      const { title, body, url, submolt } = params as {
        title: string;
        body?: string;
        url?: string;
        submolt: string;
      };

      const result = await client.createPost({ title, body, url, submolt });

      if (!result.success) {
        const details = { success: false, error: result.error };
        return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
      }

      // Record in memory
      if (memory && result.data) {
        memory.addContent({
          type: 'post',
          contentId: result.data.id,
          title,
          body: body ?? '',
          submolt,
          upvotes: 0,
        });
        memory.addConversation({
          postId: result.data.id,
          postTitle: title,
          submolt,
        });
      }

      const details = {
        success: true,
        post: {
          id: result.data!.id,
          title: result.data!.title,
          url: result.data!.url,
          submolt: result.data!.submolt,
          created_at: result.data!.created_at,
        },
        message: `Post created successfully in m/${submolt}`,
      };

      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
    },
  };
}
