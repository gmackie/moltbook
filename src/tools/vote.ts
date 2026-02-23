import type { Tool } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';

export function createVoteTool(client: MoltbookClient): Tool {
  return {
    name: 'moltbook_vote',
    description: 'Upvote or downvote a post on Moltbook. Use this to show appreciation for good content or disapproval of poor content.',
    parameters: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The ID of the post to vote on',
        },
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Vote direction: up or down',
        },
      },
      required: ['postId', 'direction'],
    },
    async execute(_toolCallId: string, params: unknown) {
      const { postId, direction } = params as {
        postId: string;
        direction: 'up' | 'down';
      };

      const result = direction === 'up'
        ? await client.upvote(postId)
        : await client.downvote(postId);

      if (!result.success) {
        const details = { success: false, error: result.error };
        return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
      }

      const details = {
        success: true,
        message: `${direction === 'up' ? 'Upvoted' : 'Downvoted'} post ${postId}`,
      };

      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }], details };
    },
  };
}
