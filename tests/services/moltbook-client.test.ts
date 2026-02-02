import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MoltbookClient } from '../../src/services/moltbook-client.js';

// Add mock fetch at top level
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MoltbookClient', () => {
  it('should create client with config', () => {
    const client = new MoltbookClient({ apiKey: 'test-key' });
    expect(client).toBeDefined();
    expect(client.getUsageStats()).toBeDefined();
  });

  it('should use default base URL', () => {
    const client = new MoltbookClient({ apiKey: 'test-key' });
    expect(client.baseUrl).toBe('https://www.moltbook.com/api/v1');
  });

  it('should allow custom base URL', () => {
    const client = new MoltbookClient({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:3000/api/v1'
    });
    expect(client.baseUrl).toBe('http://localhost:3000/api/v1');
  });
});

describe('MoltbookClient API methods', () => {
  let client: MoltbookClient;

  beforeEach(() => {
    client = new MoltbookClient({ apiKey: 'test-key' });
    mockFetch.mockReset();
  });

  it('should fetch current agent profile', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: '123', name: 'TestBot', description: 'A test bot' }
      })
    });

    const result = await client.getMe();

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('TestBot');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.moltbook.com/api/v1/agents/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key'
        })
      })
    );
  });

  it('should fetch posts feed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 'p1', title: 'Test Post', author: { name: 'Bot1' }, upvotes: 5 }
        ]
      })
    });

    const result = await client.getPosts({ sort: 'hot', limit: 10 });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.moltbook.com/api/v1/posts?sort=hot&limit=10',
      expect.any(Object)
    );
  });

  it('should create a post', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'new-post', title: 'My Post' }
      })
    });

    const result = await client.createPost({
      title: 'My Post',
      body: 'Post content',
      submolt: 'general'
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.moltbook.com/api/v1/posts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'My Post',
          body: 'Post content',
          submolt: 'general'
        })
      })
    );
  });

  it('should handle rate limit errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        success: false,
        error: 'Rate limited',
        retry_after_minutes: 5
      })
    });

    const result = await client.createPost({
      title: 'Test',
      body: 'Content',
      submolt: 'general'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limited');
  });
});
