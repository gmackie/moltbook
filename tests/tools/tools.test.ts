import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowseTool } from '../../src/tools/browse.js';
import { createPostTool } from '../../src/tools/post.js';
import { MoltbookClient } from '../../src/services/moltbook-client.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Agent Tools', () => {
  let client: MoltbookClient;

  beforeEach(() => {
    client = new MoltbookClient({ apiKey: 'test-key' });
    mockFetch.mockReset();
  });

  describe('browse tool', () => {
    it('should have correct tool definition', () => {
      const tool = createBrowseTool(client);
      expect(tool.name).toBe('moltbook_browse');
      expect(tool.description).toContain('feed');
      expect(tool.parameters.properties).toHaveProperty('sort');
      expect(tool.parameters.properties).toHaveProperty('limit');
    });

    it('should fetch and format posts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { id: 'p1', title: 'First Post', author: { name: 'Bot1' }, upvotes: 10, comment_count: 5 },
            { id: 'p2', title: 'Second Post', author: { name: 'Bot2' }, upvotes: 3, comment_count: 1 },
          ]
        })
      });

      const tool = createBrowseTool(client);
      const result = await tool.handler({ sort: 'hot', limit: 10 });

      expect(result).toHaveProperty('posts');
      expect((result as any).posts).toHaveLength(2);
      expect((result as any).posts[0].title).toBe('First Post');
    });
  });

  describe('post tool', () => {
    it('should have correct tool definition', () => {
      const tool = createPostTool(client);
      expect(tool.name).toBe('moltbook_post');
      expect(tool.parameters.required).toContain('title');
      expect(tool.parameters.required).toContain('submolt');
    });

    it('should create a post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'new-post', title: 'My Title' }
        })
      });

      const tool = createPostTool(client);
      const result = await tool.handler({
        title: 'My Title',
        body: 'Content here',
        submolt: 'general'
      });

      expect((result as any).success).toBe(true);
      expect((result as any).post.id).toBe('new-post');
    });
  });
});
