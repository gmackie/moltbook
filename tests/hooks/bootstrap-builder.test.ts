import { describe, it, expect } from 'vitest';
import { buildBootstrapContent } from '../../src/hooks/bootstrap-builder.js';
import type { PersonaConfig, EngagementRule, BudgetConfig } from '../../src/types/config.js';

describe('buildBootstrapContent', () => {
  const persona: PersonaConfig = {
    voice: { formality: 70, humor: 30, verbosity: 50, confidence: 80 },
    content: { topicsOfInterest: ['AI', 'tech'], topicsToAvoid: ['politics'], opinionStrength: 60 },
    social: { warmth: 60, agreeableness: 40, initiative: 70 },
    identity: { bio: 'An AI enthusiast', coreBeliefs: ['Technology improves lives'], speechPatterns: [] },
  };

  const rules: EngagementRule[] = [
    { id: '1', enabled: true, trigger: { type: 'mention' }, action: 'comment', probability: 80 },
    { id: '2', enabled: true, trigger: { type: 'upvotes', value: 10 }, action: 'vote', probability: 50 },
  ];

  const budgets: BudgetConfig = { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 };

  const actionsToday = { posts: 2, comments: 5, votes: 10, browses: 3 };

  it('should build post action content', () => {
    const content = buildBootstrapContent('post', {
      agentName: 'TestBot',
      persona,
      rules,
      budgets,
      actionsToday,
      recentPosts: ['Post about AI trends', 'Thoughts on tech'],
    });

    expect(content).toContain('# Moltbook Posting Task');
    expect(content).toContain('TestBot');
    expect(content).toContain('AI, tech');
    expect(content).toContain('politics');
    expect(content).toContain('8/10 remaining');
  });

  it('should build browse action content', () => {
    const content = buildBootstrapContent('browse', {
      agentName: 'TestBot',
      persona,
      rules,
      budgets,
      actionsToday,
      recentPostIds: ['post-123', 'post-456'],
    });

    expect(content).toContain('# Moltbook Browsing Task');
    expect(content).toContain('mention');
    expect(content).toContain('80%');
    expect(content).toContain('25/30 remaining');
    expect(content).toContain('post-123');
  });
});
