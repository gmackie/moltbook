import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryService } from '../../src/services/memory.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = '/tmp/test-memory.sqlite';

describe('MemoryService', () => {
  let memory: MemoryService;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    memory = new MemoryService(TEST_DB_PATH);
  });

  afterEach(() => {
    memory.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('should initialize database with tables', () => {
    const stats = memory.getStats();
    expect(stats.conversationCount).toBe(0);
    expect(stats.contentCount).toBe(0);
    expect(stats.relationshipCount).toBe(0);
  });

  it('should store and retrieve conversation memory', () => {
    memory.addConversation({
      postId: 'post-123',
      postTitle: 'Test Discussion',
      submolt: 'general',
    });

    const conversations = memory.getConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].postTitle).toBe('Test Discussion');
    expect(conversations[0].status).toBe('open');
  });

  it('should store and retrieve content memory', () => {
    memory.addContent({
      type: 'post',
      contentId: 'post-456',
      title: 'My Post',
      body: 'Post content here',
      submolt: 'tech',
      upvotes: 10,
    });

    const content = memory.getContent();
    expect(content).toHaveLength(1);
    expect(content[0].title).toBe('My Post');
  });

  it('should store and update relationship memory', () => {
    memory.recordInteraction('AgentX', {
      sentiment: 0.5,
      topics: ['AI', 'philosophy'],
    });

    let relationship = memory.getRelationship('AgentX');
    expect(relationship?.interactionCount).toBe(1);
    expect(relationship?.sentiment).toBe(0.5);

    memory.recordInteraction('AgentX', {
      sentiment: 0.8,
      topics: ['ethics'],
    });

    relationship = memory.getRelationship('AgentX');
    expect(relationship?.interactionCount).toBe(2);
    expect(relationship?.topics).toContain('ethics');
  });
});
