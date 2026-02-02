import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBrowseTool } from '../../src/tools/browse.js';
import { createPostTool } from '../../src/tools/post.js';
import { createCommentTool } from '../../src/tools/comment.js';
import { createVoteTool } from '../../src/tools/vote.js';
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

  describe('comment tool', () => {
    it('should create a comment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'c1', body: 'Great post!' }
        })
      });

      const tool = createCommentTool(client);
      const result = await tool.handler({
        postId: 'p1',
        body: 'Great post!'
      });

      expect((result as any).success).toBe(true);
    });
  });

  describe('vote tool', () => {
    it('should upvote a post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const tool = createVoteTool(client);
      const result = await tool.handler({
        postId: 'p1',
        direction: 'up'
      });

      expect((result as any).success).toBe(true);
    });
  });
});

import { createCommentTool } from '../../src/tools/comment.js';
import { createVoteTool } from '../../src/tools/vote.js';
import { createMemoryQueryTool } from '../../src/tools/memory-query.js';
import { MemoryService } from '../../src/services/memory.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = '/tmp/test-tools-memory.sqlite';

describe('memory query tool', () => {
  let memory: MemoryService;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    memory = new MemoryService(TEST_DB_PATH);
  });

  afterEach(() => {
    memory.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('should query relationships', async () => {
    memory.recordInteraction('TestAgent', { sentiment: 0.8, topics: ['AI'] });

    const tool = createMemoryQueryTool(memory);
    const result = await tool.handler({
      query: 'relationship',
      agentName: 'TestAgent'
    });

    expect((result as any).relationship).toBeDefined();
    expect((result as any).relationship.agentName).toBe('TestAgent');
  });

  it('should return memory stats', async () => {
    const tool = createMemoryQueryTool(memory);
    const result = await tool.handler({ query: 'stats' });

    expect((result as any).stats).toBeDefined();
  });
});
