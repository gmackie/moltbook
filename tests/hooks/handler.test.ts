import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMoltbookBootstrapHandler } from '../../src/hooks/moltbook-bootstrap/handler.js';
import type { PersonaConfig, BudgetConfig, EngagementRule } from '../../src/types/config.js';

describe('moltbook-bootstrap handler', () => {
  const mockConfig = {
    persona: {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: ['AI'], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: 'Test bot', coreBeliefs: [], speechPatterns: [] },
    } as PersonaConfig,
    budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 } as BudgetConfig,
    engagement: { rules: [] as EngagementRule[], trendInfluence: 50 },
  };

  const mockMemory = {
    getContent: vi.fn().mockReturnValue([]),
  };

  const mockScheduler = {
    getState: vi.fn().mockReturnValue({
      actionsToday: { posts: 0, comments: 0, votes: 0, browses: 0 },
    }),
  };

  const mockClient = {
    getMe: vi.fn().mockResolvedValue({ name: 'TestBot' }),
  };

  it('should skip non-moltbook sessions', async () => {
    const handler = createMoltbookBootstrapHandler({
      getConfig: () => mockConfig,
      memory: mockMemory as any,
      scheduler: mockScheduler as any,
      client: mockClient as any,
    });

    const event = {
      type: 'agent',
      action: 'bootstrap',
      sessionKey: 'main',
      context: { bootstrapFiles: [] },
    };

    await handler(event as any);

    expect(event.context.bootstrapFiles).toHaveLength(0);
  });

  it('should inject bootstrap for moltbook-post session', async () => {
    const handler = createMoltbookBootstrapHandler({
      getConfig: () => mockConfig,
      memory: mockMemory as any,
      scheduler: mockScheduler as any,
      client: mockClient as any,
    });

    const event = {
      type: 'agent',
      action: 'bootstrap',
      sessionKey: 'cron:moltbook-post',
      context: { bootstrapFiles: [] },
    };

    await handler(event as any);

    expect(event.context.bootstrapFiles).toHaveLength(1);
    expect(event.context.bootstrapFiles[0].name).toBe('MOLTBOOK_ACTION.md');
    expect(event.context.bootstrapFiles[0].content).toContain('Posting Task');
  });

  it('should inject bootstrap for moltbook-browse session', async () => {
    const handler = createMoltbookBootstrapHandler({
      getConfig: () => mockConfig,
      memory: mockMemory as any,
      scheduler: mockScheduler as any,
      client: mockClient as any,
    });

    const event = {
      type: 'agent',
      action: 'bootstrap',
      sessionKey: 'cron:moltbook-browse',
      context: { bootstrapFiles: [] },
    };

    await handler(event as any);

    expect(event.context.bootstrapFiles).toHaveLength(1);
    expect(event.context.bootstrapFiles[0].content).toContain('Browsing Task');
  });
});
