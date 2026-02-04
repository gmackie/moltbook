# Moltbook Plugin Phase 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the plugin with hook-based agent triggering, engagement logic, and persona persistence.

**Architecture:** Replace internal timer-based scheduler with OpenClaw cron + hooks. The `agent:bootstrap` hook injects persona and action context when cron triggers agent runs. Settings service persists persona overrides to JSON.

**Tech Stack:** TypeScript, OpenClaw hooks API, better-sqlite3 (existing), Vitest.

---

## Task 1: Settings Service

**Files:**
- Create: `src/services/settings.ts`
- Create: `tests/services/settings.test.ts`

**Step 1: Write the failing test**

Create `tests/services/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsService } from '../../src/services/settings.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SettingsService', () => {
  const testDir = join(process.cwd(), 'test-data-settings');
  let settings: SettingsService;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    settings = new SettingsService(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should return base persona when no overrides exist', () => {
    const basePersona = {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
    };

    const result = settings.getPersona(basePersona);
    expect(result).toEqual(basePersona);
  });

  it('should merge overrides with base persona', () => {
    const basePersona = {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
    };

    settings.updatePersona({ voice: { formality: 75, humor: 50, verbosity: 50, confidence: 50 } });
    const result = settings.getPersona(basePersona);

    expect(result.voice.formality).toBe(75);
    expect(result.voice.humor).toBe(50);
  });

  it('should persist overrides across instances', () => {
    const basePersona = {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
    };

    settings.updatePersona({ voice: { formality: 80, humor: 50, verbosity: 50, confidence: 50 } });

    const settings2 = new SettingsService(testDir);
    const result = settings2.getPersona(basePersona);

    expect(result.voice.formality).toBe(80);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/settings.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/services/settings.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PersonaConfig, MoltbookPluginConfig } from '../types/config.js';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge<T extends object>(base: T, overrides: DeepPartial<T>): T {
  const result = { ...base };
  for (const key in overrides) {
    const val = overrides[key];
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object') {
        result[key] = deepMerge(result[key] as object, val as object) as T[typeof key];
      } else {
        result[key] = val as T[typeof key];
      }
    }
  }
  return result;
}

interface SettingsOverrides {
  persona?: DeepPartial<PersonaConfig>;
}

export class SettingsService {
  private settingsPath: string;
  private overrides: SettingsOverrides;

  constructor(dataDir: string) {
    this.settingsPath = join(dataDir, 'moltbook-settings.json');
    this.overrides = this.load();
  }

  getPersona(baseConfig: PersonaConfig): PersonaConfig {
    if (!this.overrides.persona) return baseConfig;
    return deepMerge(baseConfig, this.overrides.persona);
  }

  updatePersona(changes: DeepPartial<PersonaConfig>): void {
    this.overrides.persona = deepMerge(this.overrides.persona || {}, changes);
    this.save();
  }

  getOverrides(): SettingsOverrides {
    return this.overrides;
  }

  private load(): SettingsOverrides {
    if (!existsSync(this.settingsPath)) {
      return {};
    }
    try {
      const content = readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private save(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.overrides, null, 2));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/settings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/settings.ts tests/services/settings.test.ts
git commit -m "feat: add settings service for persona persistence"
```

---

## Task 2: Persona Update RPC Endpoint

**Files:**
- Create: `src/rpc/persona-update.ts`
- Modify: `src/rpc/index.ts`
- Create: `tests/rpc/persona-update.test.ts`

**Step 1: Write the failing test**

Create `tests/rpc/persona-update.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUpdatePersonaRpc } from '../../src/rpc/persona-update.js';
import { SettingsService } from '../../src/services/settings.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { PersonaConfig } from '../../src/types/config.js';

describe('updatePersonaRpc', () => {
  const testDir = join(process.cwd(), 'test-data-persona-rpc');
  let settings: SettingsService;
  const basePersona: PersonaConfig = {
    voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
    content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
    social: { warmth: 50, agreeableness: 50, initiative: 50 },
    identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
  };

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    settings = new SettingsService(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should update persona and return merged result', async () => {
    const handler = createUpdatePersonaRpc(settings, () => basePersona);

    let response: { success: boolean; data: unknown } | null = null;
    await handler({
      params: { persona: { voice: { formality: 75 } } },
      respond: (success, data) => { response = { success, data }; },
    } as any);

    expect(response?.success).toBe(true);
    const data = response?.data as { persona: PersonaConfig };
    expect(data.persona.voice.formality).toBe(75);
    expect(data.persona.voice.humor).toBe(50);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/rpc/persona-update.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/rpc/persona-update.ts`:

```typescript
import type { RpcHandler } from '../types/openclaw.js';
import type { PersonaConfig } from '../types/config.js';
import type { SettingsService } from '../services/settings.js';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface UpdatePersonaParams {
  persona: DeepPartial<PersonaConfig>;
}

interface RpcContext {
  params?: UpdatePersonaParams;
  respond: (success: boolean, data: unknown) => void;
}

export function createUpdatePersonaRpc(
  settings: SettingsService,
  getBasePersona: () => PersonaConfig | undefined
): RpcHandler {
  return async (ctx) => {
    const { params, respond } = ctx as unknown as RpcContext;

    if (!params?.persona) {
      respond(false, { error: 'Missing persona parameter' });
      return;
    }

    const basePersona = getBasePersona();
    if (!basePersona) {
      respond(false, { error: 'No base persona configured' });
      return;
    }

    settings.updatePersona(params.persona);
    const updatedPersona = settings.getPersona(basePersona);

    respond(true, { persona: updatedPersona });
  };
}
```

**Step 4: Update RPC index exports**

Modify `src/rpc/index.ts`, add export:

```typescript
export { createUpdatePersonaRpc } from './persona-update.js';
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/rpc/persona-update.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/rpc/persona-update.ts src/rpc/index.ts tests/rpc/persona-update.test.ts
git commit -m "feat: add persona update RPC endpoint"
```

---

## Task 3: Bootstrap Content Builder

**Files:**
- Create: `src/hooks/bootstrap-builder.ts`
- Create: `tests/hooks/bootstrap-builder.test.ts`

**Step 1: Write the failing test**

Create `tests/hooks/bootstrap-builder.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/hooks/bootstrap-builder.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/hooks/bootstrap-builder.ts`:

```typescript
import type { PersonaConfig, EngagementRule, BudgetConfig } from '../types/config.js';

interface BuildContext {
  agentName: string;
  persona: PersonaConfig;
  rules: EngagementRule[];
  budgets: BudgetConfig;
  actionsToday: { posts: number; comments: number; votes: number; browses: number };
  recentPosts?: string[];
  recentPostIds?: string[];
}

export function buildBootstrapContent(
  actionType: 'post' | 'browse' | 'engage',
  ctx: BuildContext
): string {
  const personaSection = buildPersonaSection(ctx.persona, ctx.agentName);

  if (actionType === 'post') {
    return buildPostContent(ctx, personaSection);
  }

  return buildBrowseContent(ctx, personaSection);
}

function buildPersonaSection(persona: PersonaConfig, agentName: string): string {
  return `## Your Persona
You are **${agentName}**.

**Voice:**
- Formality: ${persona.voice.formality}/100 (${persona.voice.formality > 50 ? 'more professional' : 'more casual'})
- Humor: ${persona.voice.humor}/100 (${persona.voice.humor > 50 ? 'more playful' : 'more serious'})
- Verbosity: ${persona.voice.verbosity}/100 (${persona.voice.verbosity > 50 ? 'more elaborate' : 'more terse'})
- Confidence: ${persona.voice.confidence}/100 (${persona.voice.confidence > 50 ? 'more assertive' : 'more tentative'})

**Social Style:**
- Warmth: ${persona.social.warmth}/100
- Agreeableness: ${persona.social.agreeableness}/100
- Initiative: ${persona.social.initiative}/100

**Content:**
- Topics of interest: ${persona.content.topicsOfInterest.join(', ') || 'none specified'}
- Topics to avoid: ${persona.content.topicsToAvoid.join(', ') || 'none specified'}
- Opinion strength: ${persona.content.opinionStrength}/100

**Identity:**
- Bio: ${persona.identity.bio || 'Not specified'}
- Core beliefs: ${persona.identity.coreBeliefs.join('; ') || 'none specified'}`;
}

function buildPostContent(ctx: BuildContext, personaSection: string): string {
  const remaining = ctx.budgets.postsPerDay - ctx.actionsToday.posts;

  return `# Moltbook Posting Task

${personaSection}

## Instructions
1. Generate an original post that reflects your persona
2. Consider trending topics but stay authentic to your interests
3. Keep your voice consistent with the settings above
4. Use the \`moltbook_post\` tool to publish

## Budget Status
- Posts today: ${remaining}/${ctx.budgets.postsPerDay} remaining

## Recent Posts (avoid repetition)
${ctx.recentPosts?.map(p => `- ${p}`).join('\n') || 'No recent posts'}`;
}

function buildBrowseContent(ctx: BuildContext, personaSection: string): string {
  const commentsRemaining = ctx.budgets.commentsPerDay - ctx.actionsToday.comments;
  const votesRemaining = ctx.budgets.votesPerDay - ctx.actionsToday.votes;

  const rulesSection = ctx.rules
    .filter(r => r.enabled)
    .map(r => formatRule(r))
    .join('\n');

  return `# Moltbook Browsing Task

${personaSection}

## Engagement Rules
${rulesSection || 'No rules configured - use your judgment'}

## Instructions
1. Use \`moltbook_browse\` to fetch feed posts
2. Evaluate each post against engagement rules and your persona
3. For posts you engage with:
   - Use \`moltbook_comment\` with persona-appropriate response
   - Or use \`moltbook_vote\` if just showing appreciation
4. Use \`moltbook_memory_query\` to check past interactions

## Budget Status
- Comments today: ${commentsRemaining}/${ctx.budgets.commentsPerDay} remaining
- Votes today: ${votesRemaining}/${ctx.budgets.votesPerDay} remaining

## Recent Interactions (skip these)
${ctx.recentPostIds?.map(id => `- ${id}`).join('\n') || 'None'}`;
}

function formatRule(rule: EngagementRule): string {
  const trigger = formatTrigger(rule.trigger);
  return `- If ${trigger}: ${rule.probability}% chance to ${rule.action}`;
}

function formatTrigger(trigger: EngagementRule['trigger']): string {
  switch (trigger.type) {
    case 'mention':
      return 'a post mentions you';
    case 'upvotes':
      return `a post has ${trigger.value}+ upvotes`;
    case 'followed':
      return 'a post is from someone you follow';
    case 'keyword':
      return `a post contains "${trigger.value}"`;
    case 'submolt':
      return `a post is in ${trigger.value}`;
    default:
      return trigger.type;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/hooks/bootstrap-builder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/bootstrap-builder.ts tests/hooks/bootstrap-builder.test.ts
git commit -m "feat: add bootstrap content builder for agent context"
```

---

## Task 4: Hook Handler

**Files:**
- Create: `src/hooks/moltbook-bootstrap/HOOK.md`
- Create: `src/hooks/moltbook-bootstrap/handler.ts`
- Create: `tests/hooks/handler.test.ts`

**Step 1: Write the failing test**

Create `tests/hooks/handler.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/hooks/handler.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Create hook metadata file**

Create `src/hooks/moltbook-bootstrap/HOOK.md`:

```markdown
---
name: moltbook-bootstrap
description: Injects Moltbook persona and action context for scheduled agent runs
metadata:
  openclaw:
    events: ["agent:bootstrap"]
---

# Moltbook Bootstrap Hook

This hook intercepts `agent:bootstrap` events for Moltbook cron sessions and injects persona configuration and action instructions.

## Session Keys

- `cron:moltbook-post` - Posting action
- `cron:moltbook-browse` - Browsing/engagement action
```

**Step 4: Write handler implementation**

Create `src/hooks/moltbook-bootstrap/handler.ts`:

```typescript
import { buildBootstrapContent } from '../bootstrap-builder.js';
import type { MoltbookClient } from '../../services/moltbook-client.js';
import type { MemoryService } from '../../services/memory.js';
import type { Scheduler } from '../../services/scheduler.js';
import type { PersonaConfig, BudgetConfig, EngagementRule } from '../../types/config.js';

interface HookEvent {
  type: string;
  action: string;
  sessionKey: string;
  context: {
    bootstrapFiles: Array<{ name: string; content: string }>;
  };
}

interface HandlerDeps {
  getConfig: () => {
    persona: PersonaConfig;
    budgets: BudgetConfig;
    engagement: { rules: EngagementRule[]; trendInfluence: number };
  };
  memory: MemoryService;
  scheduler: Scheduler;
  client: MoltbookClient;
}

export function createMoltbookBootstrapHandler(deps: HandlerDeps) {
  return async (event: HookEvent): Promise<void> => {
    if (event.type !== 'agent' || event.action !== 'bootstrap') return;

    const sessionKey = event.sessionKey;
    if (!sessionKey?.startsWith('cron:moltbook-')) return;

    const actionType = sessionKey.replace('cron:moltbook-', '') as 'post' | 'browse';
    if (actionType !== 'post' && actionType !== 'browse') return;

    const config = deps.getConfig();
    const state = deps.scheduler.getState();

    let agentName = 'MoltbookBot';
    try {
      const me = await deps.client.getMe();
      agentName = me.name;
    } catch {
      // Use default name
    }

    const recentContent = deps.memory.getContent();
    const recentPosts = recentContent
      .filter(c => c.type === 'post')
      .slice(0, 5)
      .map(c => c.title || c.body.slice(0, 50));

    const recentPostIds = recentContent
      .slice(0, 20)
      .map(c => c.contentId);

    const content = buildBootstrapContent(actionType, {
      agentName,
      persona: config.persona,
      rules: config.engagement.rules,
      budgets: config.budgets,
      actionsToday: state.actionsToday,
      recentPosts,
      recentPostIds,
    });

    event.context.bootstrapFiles.push({
      name: 'MOLTBOOK_ACTION.md',
      content,
    });
  };
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/hooks/handler.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/hooks/moltbook-bootstrap/HOOK.md src/hooks/moltbook-bootstrap/handler.ts tests/hooks/handler.test.ts
git commit -m "feat: add moltbook-bootstrap hook handler"
```

---

## Task 5: Simplify Scheduler (Remove Timers)

**Files:**
- Modify: `src/services/scheduler.ts`
- Modify: `tests/services/scheduler.test.ts`

**Step 1: Update scheduler to remove timer logic**

Replace `src/services/scheduler.ts`:

```typescript
import type { ScheduledAction, SchedulerState, SchedulerConfig } from '../types/scheduler.js';

export class Scheduler {
  private config: SchedulerConfig;
  private state: SchedulerState;

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.state = {
      running: false,
      paused: false,
      actionsToday: { posts: 0, comments: 0, votes: 0, browses: 0 },
    };
  }

  start() {
    this.state.running = true;
  }

  stop() {
    this.state.running = false;
  }

  pause() {
    this.state.paused = true;
  }

  resume() {
    this.state.paused = false;
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  recordAction(type: 'post' | 'browse' | 'engage', result?: unknown, error?: string): ScheduledAction {
    const action: ScheduledAction = {
      id: crypto.randomUUID(),
      type,
      scheduledFor: new Date(),
      status: error ? 'failed' : 'completed',
      result,
      error,
    };

    this.state.lastAction = action;
    this.incrementCounter(type);

    return action;
  }

  private incrementCounter(type: 'post' | 'browse' | 'engage') {
    switch (type) {
      case 'post':
        this.state.actionsToday.posts++;
        break;
      case 'browse':
        this.state.actionsToday.browses++;
        break;
    }
  }

  resetDailyCounters() {
    this.state.actionsToday = { posts: 0, comments: 0, votes: 0, browses: 0 };
  }

  canPost(): boolean {
    return this.config.posting.enabled &&
      !this.state.paused &&
      this.state.actionsToday.posts < this.config.budgets.postsPerDay;
  }

  canBrowse(): boolean {
    return this.config.browsing.enabled && !this.state.paused;
  }
}
```

**Step 2: Update tests**

Replace `tests/services/scheduler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Scheduler } from '../../src/services/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler({
      posting: { enabled: true, intervalHours: 6, jitterMinutes: 30 },
      browsing: { enabled: true, intervalMinutes: 30 },
      budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    });
  });

  it('should start and stop cleanly', () => {
    expect(scheduler.getState().running).toBe(false);
    scheduler.start();
    expect(scheduler.getState().running).toBe(true);
    scheduler.stop();
    expect(scheduler.getState().running).toBe(false);
  });

  it('should respect pause state', () => {
    scheduler.start();
    scheduler.pause();
    expect(scheduler.getState().paused).toBe(true);
    scheduler.resume();
    expect(scheduler.getState().paused).toBe(false);
  });

  it('should track daily action counts', () => {
    const state = scheduler.getState();
    expect(state.actionsToday.posts).toBe(0);
    expect(state.actionsToday.comments).toBe(0);
  });

  it('should record actions and increment counters', () => {
    scheduler.recordAction('post');
    expect(scheduler.getState().actionsToday.posts).toBe(1);
    expect(scheduler.getState().lastAction?.type).toBe('post');
  });

  it('should check if can post based on budget', () => {
    expect(scheduler.canPost()).toBe(true);

    for (let i = 0; i < 10; i++) {
      scheduler.recordAction('post');
    }

    expect(scheduler.canPost()).toBe(false);
  });

  it('should reset daily counters', () => {
    scheduler.recordAction('post');
    scheduler.recordAction('browse');
    expect(scheduler.getState().actionsToday.posts).toBe(1);

    scheduler.resetDailyCounters();
    expect(scheduler.getState().actionsToday.posts).toBe(0);
    expect(scheduler.getState().actionsToday.browses).toBe(0);
  });
});
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- tests/services/scheduler.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/services/scheduler.ts tests/services/scheduler.test.ts
git commit -m "refactor: remove timer logic from scheduler, use state tracking only"
```

---

## Task 6: Wire Up Plugin Entry Point

**Files:**
- Modify: `index.ts`

**Step 1: Update index.ts to integrate all components**

Replace `index.ts`:

```typescript
import type { PluginApi } from './src/types/openclaw.js';
import type { MoltbookPluginConfig } from './src/types/config.js';
import { MoltbookClient } from './src/services/moltbook-client.js';
import { MemoryService } from './src/services/memory.js';
import { Scheduler } from './src/services/scheduler.js';
import { SettingsService } from './src/services/settings.js';
import {
  createBrowseTool,
  createPostTool,
  createCommentTool,
  createVoteTool,
  createMemoryQueryTool
} from './src/tools/index.js';
import {
  createStatusRpc,
  createScheduleStateRpc,
  createSchedulePauseRpc,
  createScheduleResumeRpc,
  createGetPersonaRpc,
  createUpdatePersonaRpc,
  createMemoryStatsRpc,
} from './src/rpc/index.js';
import { createMoltbookBootstrapHandler } from './src/hooks/moltbook-bootstrap/handler.js';
import { join } from 'path';
import { mkdirSync } from 'fs';

export default function register(api: PluginApi) {
  const config = api.config as MoltbookPluginConfig;

  if (!config.apiKey) {
    api.logger.warn('Moltbook: No API key configured');
    return;
  }

  api.logger.info('Moltbook: Initializing plugin');

  // Initialize services
  const client = new MoltbookClient({ apiKey: config.apiKey });

  // Ensure data directory exists
  const dataDir = join(process.cwd(), 'data');
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch {}

  const dbPath = join(dataDir, 'moltbook-memory.sqlite');
  const memory = new MemoryService(dbPath);
  const settings = new SettingsService(dataDir);

  // Initialize scheduler (state tracking only, no timers)
  const scheduler = new Scheduler({
    posting: {
      enabled: config.schedule?.enabled ?? false,
      intervalHours: config.schedule?.posting?.intervalHours ?? 6,
      jitterMinutes: config.schedule?.posting?.jitterMinutes ?? 30,
    },
    browsing: {
      enabled: config.schedule?.enabled ?? false,
      intervalMinutes: config.schedule?.browsing?.intervalMinutes ?? 30,
    },
    budgets: {
      postsPerDay: config.budgets?.postsPerDay ?? 10,
      commentsPerDay: config.budgets?.commentsPerDay ?? 30,
      votesPerDay: config.budgets?.votesPerDay ?? 50,
    },
  });

  // Helper to get merged persona config
  const getPersona = () => {
    if (!config.persona) return undefined;
    return settings.getPersona(config.persona);
  };

  // Helper to get full config for hooks
  const getFullConfig = () => ({
    persona: getPersona()!,
    budgets: config.budgets ?? { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    engagement: config.engagement ?? { rules: [], trendInfluence: 50 },
  });

  // Register agent tools
  api.registerTool(createBrowseTool(client));
  api.registerTool(createPostTool(client, memory));
  api.registerTool(createCommentTool(client, memory));
  api.registerTool(createVoteTool(client));
  api.registerTool(createMemoryQueryTool(memory));

  // Register RPC endpoints for dashboard
  const getSchedulerState = () => {
    const state = scheduler.getState();
    if (!state.running) return 'idle' as const;
    if (state.paused) return 'idle' as const;
    if (state.lastAction?.status === 'running') {
      return state.lastAction.type === 'browse' ? 'browsing' as const : 'posting' as const;
    }
    return 'idle' as const;
  };

  api.registerGatewayMethod('moltbook.status', createStatusRpc(client, memory, getSchedulerState));
  api.registerGatewayMethod('moltbook.schedule.state', createScheduleStateRpc(scheduler));
  api.registerGatewayMethod('moltbook.schedule.pause', createSchedulePauseRpc(scheduler));
  api.registerGatewayMethod('moltbook.schedule.resume', createScheduleResumeRpc(scheduler));
  api.registerGatewayMethod('moltbook.persona', createGetPersonaRpc(getPersona));
  api.registerGatewayMethod('moltbook.persona.update', createUpdatePersonaRpc(settings, getPersona));
  api.registerGatewayMethod('moltbook.memory.stats', createMemoryStatsRpc(memory));

  // Create and export hook handler for external registration
  const bootstrapHandler = createMoltbookBootstrapHandler({
    getConfig: getFullConfig,
    memory,
    scheduler,
    client,
  });

  // Register background service
  api.registerService({
    id: 'moltbook-scheduler',
    start: () => {
      api.logger.info('Moltbook: Scheduler service starting');
      if (config.schedule?.enabled) {
        scheduler.start();
      }
    },
    stop: () => {
      api.logger.info('Moltbook: Scheduler service stopping');
      scheduler.stop();
      memory.close();
    },
  });

  api.logger.info('Moltbook: Plugin initialized successfully');

  // Return hook handler for plugin hook registration
  return {
    hooks: {
      'agent:bootstrap': bootstrapHandler,
    },
  };
}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Success with no errors

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add index.ts
git commit -m "feat: wire up settings service and hook handler in plugin entry"
```

---

## Task 7: Dashboard API Client Update

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/api/types.ts`

**Step 1: Add persona types**

Add to `ui/src/api/types.ts`:

```typescript
export interface PersonaConfig {
  voice: {
    formality: number;
    humor: number;
    verbosity: number;
    confidence: number;
  };
  content: {
    topicsOfInterest: string[];
    topicsToAvoid: string[];
    opinionStrength: number;
  };
  social: {
    warmth: number;
    agreeableness: number;
    initiative: number;
  };
  identity?: {
    bio: string;
    coreBeliefs: string[];
    speechPatterns: string[];
  };
}

export interface PersonaResponse {
  persona: PersonaConfig | null;
}

export interface UpdatePersonaResponse {
  persona: PersonaConfig;
}
```

**Step 2: Add API methods**

Update `ui/src/api/client.ts`:

```typescript
import type { StatusResponse, ScheduleStateResponse, RpcResponse, PersonaResponse, UpdatePersonaResponse, PersonaConfig } from './types';

const API_BASE = '/api/rpc';

async function rpc<T>(method: string, params?: unknown): Promise<RpcResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

export const api = {
  getStatus: () => rpc<StatusResponse>('moltbook.status'),
  getScheduleState: () => rpc<ScheduleStateResponse>('moltbook.schedule.state'),
  pauseSchedule: () => rpc<{ paused: boolean }>('moltbook.schedule.pause'),
  resumeSchedule: () => rpc<{ paused: boolean }>('moltbook.schedule.resume'),
  getPersona: () => rpc<PersonaResponse>('moltbook.persona'),
  updatePersona: (persona: Partial<PersonaConfig>) =>
    rpc<UpdatePersonaResponse>('moltbook.persona.update', { persona }),
};
```

**Step 3: Commit**

```bash
git add ui/src/api/client.ts ui/src/api/types.ts
git commit -m "feat: add persona API methods to dashboard client"
```

---

## Task 8: Wire Up PersonaEditor Save Button

**Files:**
- Modify: `ui/src/components/PersonaEditor.tsx`

**Step 1: Update PersonaEditor with save functionality**

Replace `ui/src/components/PersonaEditor.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { Slider } from './Slider';
import { api } from '../api/client';
import type { PersonaConfig } from '../api/types';

const defaultPersona: PersonaConfig = {
  voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
  content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
  social: { warmth: 50, agreeableness: 50, initiative: 50 },
};

export function PersonaEditor() {
  const [persona, setPersona] = useState<PersonaConfig>(defaultPersona);
  const [activeTab, setActiveTab] = useState<'voice' | 'content' | 'social'>('voice');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPersona().then(res => {
      if (res.success && res.data.persona) {
        setPersona(res.data.persona);
      }
    });
  }, []);

  const updateVoice = (key: keyof PersonaConfig['voice'], value: number) => {
    setPersona(p => ({ ...p, voice: { ...p.voice, [key]: value } }));
    setDirty(true);
  };

  const updateSocial = (key: keyof PersonaConfig['social'], value: number) => {
    setPersona(p => ({ ...p, social: { ...p.social, [key]: value } }));
    setDirty(true);
  };

  const updateContent = (key: keyof PersonaConfig['content'], value: number | string[]) => {
    setPersona(p => ({ ...p, content: { ...p.content, [key]: value } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const result = await api.updatePersona(persona);

    if (result.success) {
      setPersona(result.data.persona);
      setDirty(false);
    } else {
      setError(result.error || 'Failed to save');
    }

    setSaving(false);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Persona</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['voice', 'content', 'social'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm capitalize ${
              activeTab === tab ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Voice Tab */}
      {activeTab === 'voice' && (
        <div className="space-y-4">
          <Slider
            label="Formality"
            value={persona.voice.formality}
            onChange={(v) => updateVoice('formality', v)}
            leftLabel="Casual"
            rightLabel="Professional"
          />
          <Slider
            label="Humor"
            value={persona.voice.humor}
            onChange={(v) => updateVoice('humor', v)}
            leftLabel="Serious"
            rightLabel="Playful"
          />
          <Slider
            label="Verbosity"
            value={persona.voice.verbosity}
            onChange={(v) => updateVoice('verbosity', v)}
            leftLabel="Terse"
            rightLabel="Elaborate"
          />
          <Slider
            label="Confidence"
            value={persona.voice.confidence}
            onChange={(v) => updateVoice('confidence', v)}
            leftLabel="Tentative"
            rightLabel="Assertive"
          />
        </div>
      )}

      {/* Social Tab */}
      {activeTab === 'social' && (
        <div className="space-y-4">
          <Slider
            label="Warmth"
            value={persona.social.warmth}
            onChange={(v) => updateSocial('warmth', v)}
            leftLabel="Distant"
            rightLabel="Friendly"
          />
          <Slider
            label="Agreeableness"
            value={persona.social.agreeableness}
            onChange={(v) => updateSocial('agreeableness', v)}
            leftLabel="Contrarian"
            rightLabel="Agreeable"
          />
          <Slider
            label="Initiative"
            value={persona.social.initiative}
            onChange={(v) => updateSocial('initiative', v)}
            leftLabel="Reactive"
            rightLabel="Proactive"
          />
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <Slider
            label="Opinion Strength"
            value={persona.content.opinionStrength}
            onChange={(v) => updateContent('opinionStrength', v)}
            leftLabel="Neutral"
            rightLabel="Strong Takes"
          />
          <div>
            <label className="block text-sm mb-1">Topics of Interest</label>
            <input
              type="text"
              placeholder="AI, philosophy, tech..."
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
              value={persona.content.topicsOfInterest.join(', ')}
              onChange={(e) => updateContent('topicsOfInterest', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Topics to Avoid</label>
            <input
              type="text"
              placeholder="politics, religion..."
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
              value={persona.content.topicsToAvoid.join(', ')}
              onChange={(e) => updateContent('topicsToAvoid', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`w-full rounded py-2 text-sm font-medium ${
            dirty && !saving
              ? 'bg-blue-600 hover:bg-blue-500'
              : 'bg-gray-600 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Build UI**

Run: `cd ui && npm run build`
Expected: Success

**Step 3: Commit**

```bash
git add ui/src/components/PersonaEditor.tsx
git commit -m "feat: wire up persona save functionality in dashboard"
```

---

## Task 9: Final Build and Test

**Files:**
- None (verification only)

**Step 1: Build plugin**

Run: `npm run build`
Expected: Success with no errors

**Step 2: Build UI**

Run: `cd ui && npm run build`
Expected: Success

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: phase 3 complete - hook-based scheduling and persona persistence"
```

---

## Summary

**New files created:**
- `src/services/settings.ts` - Persona persistence
- `src/rpc/persona-update.ts` - Update RPC endpoint
- `src/hooks/bootstrap-builder.ts` - Bootstrap content generation
- `src/hooks/moltbook-bootstrap/HOOK.md` - Hook metadata
- `src/hooks/moltbook-bootstrap/handler.ts` - Hook handler
- `tests/services/settings.test.ts`
- `tests/rpc/persona-update.test.ts`
- `tests/hooks/bootstrap-builder.test.ts`
- `tests/hooks/handler.test.ts`

**Modified files:**
- `index.ts` - Integrated all new components
- `src/services/scheduler.ts` - Simplified to state tracking only
- `src/rpc/index.ts` - Added export
- `ui/src/api/client.ts` - Added persona methods
- `ui/src/api/types.ts` - Added persona types
- `ui/src/components/PersonaEditor.tsx` - Wired save button

**Cron setup (manual, document in README):**
```bash
openclaw cron add --every 6h --session-key cron:moltbook-post
openclaw cron add --every 30m --session-key cron:moltbook-browse
```
