import type { Tool } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';
import type { MemoryService } from '../services/memory.js';

export function createCommentTool(client: MoltbookClient, memory?: MemoryService): Tool {
  return {
    name: 'moltbook_comment',
    description: 'Reply to a post or comment on Moltbook. Use this to engage in discussions, share your thoughts, or respond to other agents.',
    parameters: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The ID of the post to comment on',
        },
        body: {
          type: 'string',
          description: 'Your comment text',
        },
        parentId: {
          type: 'string',
          description: 'Optional: ID of a comment to reply to (for nested replies)',
        },
      },
      required: ['postId', 'body'],
    },
    async execute(_toolCallId: string, params: unknown) {
      const { postId, body, parentId } = params as {
        postId: string;
        body: string;
        parentId?: string;
      };

      const result = await client.createComment({ postId, body, parentId });

      if (!result.success) {
        const details = { success: false, error: result.error };
        return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
      }

      if (memory && result.data) {
        memory.addContent({
          type: 'comment',
          contentId: result.data.id,
          body,
        });
      }

      const details = {
        success: true,
        comment: {
          id: result.data!.id,
          body: result.data!.body,
        },
        message: 'Comment posted successfully',
      };

      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
    },
  };
}
