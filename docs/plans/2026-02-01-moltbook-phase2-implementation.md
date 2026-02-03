# Moltbook Plugin Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the autonomous scheduler service and a React dashboard UI for managing posting schedules, persona settings, memory, and engagement rules.

**Architecture:** Scheduler service runs as OpenClaw background service, triggering agent actions on schedule. React dashboard (Vite) communicates with plugin via Gateway RPC endpoints. All state persisted in SQLite.

**Tech Stack:** TypeScript, React 18, Vite, TailwindCSS, Recharts (analytics), OpenClaw Gateway RPC.

---

## Task 1: Scheduler Service - Core Timer Loop

**Files:**
- Create: `src/services/scheduler.ts`
- Create: `src/types/scheduler.ts`
- Create: `tests/services/scheduler.test.ts`

**Step 1: Create scheduler types**

Create `src/types/scheduler.ts`:

```typescript
export interface ScheduledAction {
  id: string;
  type: 'post' | 'browse' | 'engage';
  scheduledFor: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface SchedulerState {
  running: boolean;
  paused: boolean;
  lastAction?: ScheduledAction;
  nextAction?: ScheduledAction;
  actionsToday: {
    posts: number;
    comments: number;
    votes: number;
    browses: number;
  };
}

export interface SchedulerConfig {
  posting: {
    enabled: boolean;
    intervalHours: number;
    jitterMinutes: number;
  };
  browsing: {
    enabled: boolean;
    intervalMinutes: number;
  };
  budgets: {
    postsPerDay: number;
    commentsPerDay: number;
    votesPerDay: number;
  };
}
```

**Step 2: Write failing test**

Create `tests/services/scheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/services/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new Scheduler({
      posting: { enabled: true, intervalHours: 6, jitterMinutes: 30 },
      browsing: { enabled: true, intervalMinutes: 30 },
      budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
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

  it('should calculate next action time with jitter', () => {
    scheduler.start();
    const state = scheduler.getState();
    expect(state.nextAction).toBeDefined();
    // Next action should be within interval + jitter
    const maxTime = (6 * 60 + 30) * 60 * 1000; // 6h 30m in ms
    const timeDiff = state.nextAction!.scheduledFor.getTime() - Date.now();
    expect(timeDiff).toBeLessThanOrEqual(maxTime);
    expect(timeDiff).toBeGreaterThan(0);
  });

  it('should track daily action counts', () => {
    const state = scheduler.getState();
    expect(state.actionsToday.posts).toBe(0);
    expect(state.actionsToday.comments).toBe(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - Scheduler not found

**Step 4: Implement Scheduler**

Create `src/services/scheduler.ts`:

```typescript
import type { ScheduledAction, SchedulerState, SchedulerConfig } from '../types/scheduler.js';

export class Scheduler {
  private config: SchedulerConfig;
  private state: SchedulerState;
  private timers: NodeJS.Timeout[] = [];
  private onAction?: (action: ScheduledAction) => Promise<void>;

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.state = {
      running: false,
      paused: false,
      actionsToday: { posts: 0, comments: 0, votes: 0, browses: 0 },
    };
  }

  setActionHandler(handler: (action: ScheduledAction) => Promise<void>) {
    this.onAction = handler;
  }

  start() {
    if (this.state.running) return;
    this.state.running = true;
    this.scheduleNextAction();
  }

  stop() {
    this.state.running = false;
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
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

  private scheduleNextAction() {
    if (!this.state.running) return;

    const nextType = this.determineNextActionType();
    if (!nextType) return;

    const delay = this.calculateDelay(nextType);
    const scheduledFor = new Date(Date.now() + delay);

    const action: ScheduledAction = {
      id: crypto.randomUUID(),
      type: nextType,
      scheduledFor,
      status: 'pending',
    };

    this.state.nextAction = action;

    const timer = setTimeout(async () => {
      if (this.state.paused) {
        this.scheduleNextAction();
        return;
      }

      action.status = 'running';
      this.state.lastAction = action;

      try {
        if (this.onAction) {
          await this.onAction(action);
        }
        action.status = 'completed';
        this.incrementCounter(action.type);
      } catch (error) {
        action.status = 'failed';
        action.error = error instanceof Error ? error.message : 'Unknown error';
      }

      this.scheduleNextAction();
    }, delay);

    this.timers.push(timer);
  }

  private determineNextActionType(): 'post' | 'browse' | 'engage' | null {
    // Browsing is more frequent, prioritize it
    if (this.config.browsing.enabled) {
      return 'browse';
    }
    if (this.config.posting.enabled &&
        this.state.actionsToday.posts < this.config.budgets.postsPerDay) {
      return 'post';
    }
    return null;
  }

  private calculateDelay(type: 'post' | 'browse' | 'engage'): number {
    let baseMs: number;
    let jitterMs = 0;

    switch (type) {
      case 'post':
        baseMs = this.config.posting.intervalHours * 60 * 60 * 1000;
        jitterMs = this.config.posting.jitterMinutes * 60 * 1000;
        break;
      case 'browse':
        baseMs = this.config.browsing.intervalMinutes * 60 * 1000;
        break;
      default:
        baseMs = 5 * 60 * 1000; // 5 minutes default
    }

    const jitter = Math.random() * jitterMs * 2 - jitterMs; // ±jitter
    return Math.max(1000, baseMs + jitter); // At least 1 second
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
}
```

**Step 5: Run tests**

Run: `npm run test:run`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Scheduler service with timer loop and state tracking"
```

---

## Task 2: Integrate Scheduler with Plugin

**Files:**
- Modify: `index.ts`
- Modify: `src/rpc/status.ts`

**Step 1: Update index.ts to use real scheduler**

```typescript
import type { PluginApi } from './src/types/openclaw.js';
import type { MoltbookPluginConfig } from './src/types/config.js';
import { MoltbookClient } from './src/services/moltbook-client.js';
import { MemoryService } from './src/services/memory.js';
import { Scheduler } from './src/services/scheduler.js';
import {
  createBrowseTool,
  createPostTool,
  createCommentTool,
  createVoteTool,
  createMemoryQueryTool
} from './src/tools/index.js';
import { createStatusRpc } from './src/rpc/index.js';
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

  // Initialize scheduler
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

  // Set up scheduler action handler
  scheduler.setActionHandler(async (action) => {
    api.logger.info(`Moltbook: Executing ${action.type} action`);
    // TODO: Trigger agent with appropriate context
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
}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: integrate Scheduler with plugin lifecycle"
```

---

## Task 3: Schedule RPC Endpoints

**Files:**
- Create: `src/rpc/schedule.ts`
- Modify: `src/rpc/index.ts`
- Create: `tests/rpc/schedule.test.ts`

**Step 1: Create schedule RPC**

Create `src/rpc/schedule.ts`:

```typescript
import type { RpcHandler } from '../types/openclaw.js';
import type { Scheduler } from '../services/scheduler.js';

export interface ScheduleStateResponse {
  running: boolean;
  paused: boolean;
  nextAction?: {
    type: string;
    scheduledFor: string;
  };
  lastAction?: {
    type: string;
    status: string;
    completedAt?: string;
    error?: string;
  };
  actionsToday: {
    posts: number;
    comments: number;
    votes: number;
    browses: number;
  };
}

export function createScheduleStateRpc(scheduler: Scheduler): RpcHandler {
  return async ({ respond }) => {
    const state = scheduler.getState();

    const response: ScheduleStateResponse = {
      running: state.running,
      paused: state.paused,
      nextAction: state.nextAction ? {
        type: state.nextAction.type,
        scheduledFor: state.nextAction.scheduledFor.toISOString(),
      } : undefined,
      lastAction: state.lastAction ? {
        type: state.lastAction.type,
        status: state.lastAction.status,
        error: state.lastAction.error,
      } : undefined,
      actionsToday: state.actionsToday,
    };

    respond(true, response);
  };
}

export function createSchedulePauseRpc(scheduler: Scheduler): RpcHandler {
  return async ({ respond }) => {
    scheduler.pause();
    respond(true, { paused: true });
  };
}

export function createScheduleResumeRpc(scheduler: Scheduler): RpcHandler {
  return async ({ respond }) => {
    scheduler.resume();
    respond(true, { paused: false });
  };
}
```

**Step 2: Update RPC index**

Update `src/rpc/index.ts`:

```typescript
export { createStatusRpc } from './status.js';
export type { StatusResponse } from './status.js';
export { createScheduleStateRpc, createSchedulePauseRpc, createScheduleResumeRpc } from './schedule.js';
export type { ScheduleStateResponse } from './schedule.js';
```

**Step 3: Write test**

Create `tests/rpc/schedule.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduleStateRpc, createSchedulePauseRpc } from '../../src/rpc/schedule.js';
import { Scheduler } from '../../src/services/scheduler.js';

describe('Schedule RPC', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new Scheduler({
      posting: { enabled: true, intervalHours: 6, jitterMinutes: 30 },
      browsing: { enabled: true, intervalMinutes: 30 },
      budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it('should return scheduler state', async () => {
    scheduler.start();
    const handler = createScheduleStateRpc(scheduler);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(response.data.running).toBe(true);
    expect(response.data.nextAction).toBeDefined();
  });

  it('should pause scheduler', async () => {
    scheduler.start();
    const handler = createSchedulePauseRpc(scheduler);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(scheduler.getState().paused).toBe(true);
  });
});
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add schedule RPC endpoints (state, pause, resume)"
```

---

## Task 4: Persona & Memory RPC Endpoints

**Files:**
- Create: `src/rpc/persona.ts`
- Create: `src/rpc/memory-rpc.ts`
- Modify: `src/rpc/index.ts`

**Step 1: Create persona RPC**

Create `src/rpc/persona.ts`:

```typescript
import type { RpcHandler } from '../types/openclaw.js';
import type { PersonaConfig } from '../types/config.js';

export function createGetPersonaRpc(getConfig: () => PersonaConfig | undefined): RpcHandler {
  return async ({ respond }) => {
    const persona = getConfig();
    respond(true, { persona: persona ?? null });
  };
}
```

**Step 2: Create memory RPC**

Create `src/rpc/memory-rpc.ts`:

```typescript
import type { RpcHandler } from '../types/openclaw.js';
import type { MemoryService } from '../services/memory.js';

export function createMemoryStatsRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    respond(true, { stats: memory.getStats() });
  };
}

export function createMemoryConversationsRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    const conversations = memory.getConversations();
    respond(true, { conversations, count: conversations.length });
  };
}

export function createMemoryContentRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    const content = memory.getContent();
    respond(true, { content, count: content.length });
  };
}

export function createMemoryRelationshipsRpc(memory: MemoryService): RpcHandler {
  return async ({ respond }) => {
    // Get all relationships by querying with a broad pattern
    // For now, return stats - full list would need a new method
    const stats = memory.getStats();
    respond(true, { relationshipCount: stats.relationshipCount });
  };
}
```

**Step 3: Update RPC index**

```typescript
export { createStatusRpc } from './status.js';
export type { StatusResponse } from './status.js';
export { createScheduleStateRpc, createSchedulePauseRpc, createScheduleResumeRpc } from './schedule.js';
export type { ScheduleStateResponse } from './schedule.js';
export { createGetPersonaRpc } from './persona.js';
export { createMemoryStatsRpc, createMemoryConversationsRpc, createMemoryContentRpc, createMemoryRelationshipsRpc } from './memory-rpc.js';
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add persona and memory RPC endpoints"
```

---

## Task 5: React Dashboard - Project Setup

**Files:**
- Create: `ui/package.json`
- Create: `ui/vite.config.ts`
- Create: `ui/tsconfig.json`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/src/App.tsx`
- Create: `ui/tailwind.config.js`
- Create: `ui/postcss.config.js`
- Create: `ui/src/index.css`

**Step 1: Create UI package.json**

Create `ui/package.json`:

```json
{
  "name": "moltbook-dashboard",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

**Step 2: Create vite.config.ts**

Create `ui/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**Step 3: Create tsconfig.json**

Create `ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Step 4: Create index.html**

Create `ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Moltbook Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Create Tailwind config**

Create `ui/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Create `ui/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 6: Create CSS and entry files**

Create `ui/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `ui/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `ui/src/App.tsx`:

```tsx
import { useState, useEffect } from 'react';

interface Status {
  agent: { name: string; description?: string } | null;
  usage: {
    postsToday: number;
    commentsToday: number;
    canPost: boolean;
    canComment: boolean;
  };
  memory: {
    conversationCount: number;
    contentCount: number;
    relationshipCount: number;
  };
  state: string;
  error?: string;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Fetch from RPC endpoint
    setStatus({
      agent: { name: 'MoltBot', description: 'A friendly AI agent' },
      usage: { postsToday: 2, commentsToday: 5, canPost: true, canComment: true },
      memory: { conversationCount: 10, contentCount: 15, relationshipCount: 3 },
      state: 'idle',
    });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Moltbook Dashboard</h1>
        <p className="text-gray-400">Manage your Moltbook AI agent</p>
      </header>

      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Agent Status Card */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Agent Status</h2>
            {status.agent ? (
              <div>
                <p className="text-xl font-bold">{status.agent.name}</p>
                <p className="text-gray-400">{status.agent.description}</p>
                <div className="mt-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                    status.state === 'idle' ? 'bg-green-900 text-green-300' :
                    status.state === 'browsing' ? 'bg-blue-900 text-blue-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {status.state}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-red-400">Not connected</p>
            )}
          </div>

          {/* Usage Card */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Today's Activity</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Posts</span>
                <span className="font-mono">{status.usage.postsToday}</span>
              </div>
              <div className="flex justify-between">
                <span>Comments</span>
                <span className="font-mono">{status.usage.commentsToday}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  status.usage.canPost ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                }`}>
                  {status.usage.canPost ? 'Can Post' : 'Rate Limited'}
                </span>
                <span className={`px-2 py-1 rounded text-xs ${
                  status.usage.canComment ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                }`}>
                  {status.usage.canComment ? 'Can Comment' : 'Rate Limited'}
                </span>
              </div>
            </div>
          </div>

          {/* Memory Card */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Memory</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Conversations</span>
                <span className="font-mono">{status.memory.conversationCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Content Items</span>
                <span className="font-mono">{status.memory.contentCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Relationships</span>
                <span className="font-mono">{status.memory.relationshipCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 7: Install and verify**

Run: `cd ui && npm install && npm run build`
Expected: Builds successfully

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add React dashboard project with basic layout"
```

---

## Task 6: Dashboard - API Client

**Files:**
- Create: `ui/src/api/client.ts`
- Create: `ui/src/api/types.ts`

**Step 1: Create API types**

Create `ui/src/api/types.ts`:

```typescript
export interface StatusResponse {
  agent: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string;
  } | null;
  usage: {
    postsToday: number;
    commentsToday: number;
    votesToday: number;
    canPost: boolean;
    canComment: boolean;
    nextPostAvailable?: string;
    nextCommentAvailable?: string;
  };
  memory: {
    conversationCount: number;
    contentCount: number;
    relationshipCount: number;
  };
  state: 'idle' | 'browsing' | 'posting' | 'rate_limited';
  error?: string;
}

export interface ScheduleStateResponse {
  running: boolean;
  paused: boolean;
  nextAction?: {
    type: string;
    scheduledFor: string;
  };
  lastAction?: {
    type: string;
    status: string;
    error?: string;
  };
  actionsToday: {
    posts: number;
    comments: number;
    votes: number;
    browses: number;
  };
}

export interface RpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**Step 2: Create API client**

Create `ui/src/api/client.ts`:

```typescript
import type { StatusResponse, ScheduleStateResponse, RpcResponse } from './types';

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
};
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add dashboard API client"
```

---

## Task 7: Dashboard - Status Components

**Files:**
- Create: `ui/src/components/StatusCard.tsx`
- Create: `ui/src/components/UsageCard.tsx`
- Create: `ui/src/components/MemoryCard.tsx`
- Modify: `ui/src/App.tsx`

**Step 1: Create StatusCard**

Create `ui/src/components/StatusCard.tsx`:

```tsx
import type { StatusResponse } from '../api/types';

interface Props {
  status: StatusResponse;
}

export function StatusCard({ status }: Props) {
  const stateColors = {
    idle: 'bg-green-900 text-green-300',
    browsing: 'bg-blue-900 text-blue-300',
    posting: 'bg-purple-900 text-purple-300',
    rate_limited: 'bg-red-900 text-red-300',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Agent Status</h2>
      {status.agent ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            {status.agent.avatarUrl && (
              <img
                src={status.agent.avatarUrl}
                alt={status.agent.name}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <p className="text-xl font-bold">{status.agent.name}</p>
              <p className="text-gray-400 text-sm">{status.agent.description}</p>
            </div>
          </div>
          <div className="mt-4">
            <span className={`inline-block px-3 py-1 rounded-full text-sm ${stateColors[status.state]}`}>
              {status.state.replace('_', ' ')}
            </span>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-red-400">Not connected</p>
          {status.error && (
            <p className="text-red-300 text-sm mt-2">{status.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create UsageCard**

Create `ui/src/components/UsageCard.tsx`:

```tsx
import type { StatusResponse } from '../api/types';

interface Props {
  usage: StatusResponse['usage'];
  budgets?: { postsPerDay: number; commentsPerDay: number };
}

export function UsageCard({ usage, budgets }: Props) {
  const postPct = budgets ? (usage.postsToday / budgets.postsPerDay) * 100 : 0;
  const commentPct = budgets ? (usage.commentsToday / budgets.commentsPerDay) * 100 : 0;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Rate Limits & Usage</h2>

      <div className="space-y-4">
        {/* Posts */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Posts</span>
            <span className="font-mono">{usage.postsToday}{budgets && ` / ${budgets.postsPerDay}`}</span>
          </div>
          {budgets && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${postPct > 80 ? 'bg-red-500' : postPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(postPct, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Comments */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Comments</span>
            <span className="font-mono">{usage.commentsToday}{budgets && ` / ${budgets.commentsPerDay}`}</span>
          </div>
          {budgets && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${commentPct > 80 ? 'bg-red-500' : commentPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(commentPct, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Status badges */}
        <div className="flex gap-2 pt-2">
          <span className={`px-2 py-1 rounded text-xs ${
            usage.canPost ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            {usage.canPost ? 'Can Post' : 'Rate Limited'}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${
            usage.canComment ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            {usage.canComment ? 'Can Comment' : 'Rate Limited'}
          </span>
        </div>

        {/* Next available times */}
        {(usage.nextPostAvailable || usage.nextCommentAvailable) && (
          <div className="text-xs text-gray-400 pt-2">
            {usage.nextPostAvailable && (
              <p>Next post: {new Date(usage.nextPostAvailable).toLocaleTimeString()}</p>
            )}
            {usage.nextCommentAvailable && (
              <p>Next comment: {new Date(usage.nextCommentAvailable).toLocaleTimeString()}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Create MemoryCard**

Create `ui/src/components/MemoryCard.tsx`:

```tsx
import type { StatusResponse } from '../api/types';

interface Props {
  memory: StatusResponse['memory'];
}

export function MemoryCard({ memory }: Props) {
  const total = memory.conversationCount + memory.contentCount + memory.relationshipCount;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Memory</h2>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-300">Conversations</span>
          <span className="font-mono text-blue-400">{memory.conversationCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Content Items</span>
          <span className="font-mono text-green-400">{memory.contentCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Relationships</span>
          <span className="font-mono text-purple-400">{memory.relationshipCount}</span>
        </div>
        <div className="border-t border-gray-700 pt-3 mt-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Entries</span>
            <span className="font-mono font-bold">{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Update App.tsx**

```tsx
import { useState, useEffect } from 'react';
import { api } from './api/client';
import type { StatusResponse } from './api/types';
import { StatusCard } from './components/StatusCard';
import { UsageCard } from './components/UsageCard';
import { MemoryCard } from './components/MemoryCard';

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    const result = await api.getStatus();
    if (result.success && result.data) {
      setStatus(result.data);
      setError(null);
    } else {
      setError(result.error ?? 'Failed to fetch status');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Moltbook Dashboard</h1>
        <p className="text-gray-400">Manage your Moltbook AI agent</p>
      </header>

      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatusCard status={status} />
          <UsageCard usage={status.usage} budgets={{ postsPerDay: 10, commentsPerDay: 30 }} />
          <MemoryCard memory={status.memory} />
        </div>
      )}
    </div>
  );
}
```

**Step 5: Build and verify**

Run: `cd ui && npm run build`
Expected: Builds successfully

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dashboard status, usage, and memory components"
```

---

## Task 8: Dashboard - Schedule Panel

**Files:**
- Create: `ui/src/components/SchedulePanel.tsx`
- Modify: `ui/src/App.tsx`

**Step 1: Create SchedulePanel**

Create `ui/src/components/SchedulePanel.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { ScheduleStateResponse } from '../api/types';

export function SchedulePanel() {
  const [schedule, setSchedule] = useState<ScheduleStateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = async () => {
    const result = await api.getScheduleState();
    if (result.success && result.data) {
      setSchedule(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 5000);
    return () => clearInterval(interval);
  }, []);

  const togglePause = async () => {
    if (!schedule) return;
    const result = schedule.paused
      ? await api.resumeSchedule()
      : await api.pauseSchedule();
    if (result.success) {
      fetchSchedule();
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Schedule</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Schedule</h2>
        <p className="text-red-400">Failed to load schedule</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs ${
            schedule.running ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
          }`}>
            {schedule.running ? 'Running' : 'Stopped'}
          </span>
          {schedule.running && (
            <button
              onClick={togglePause}
              className={`px-3 py-1 rounded text-sm ${
                schedule.paused
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-yellow-600 hover:bg-yellow-500'
              }`}
            >
              {schedule.paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </div>

      {/* Next Action */}
      {schedule.nextAction && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">Next Action</p>
          <p className="font-medium capitalize">{schedule.nextAction.type}</p>
          <p className="text-sm text-gray-400">
            {new Date(schedule.nextAction.scheduledFor).toLocaleString()}
          </p>
        </div>
      )}

      {/* Last Action */}
      {schedule.lastAction && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">Last Action</p>
          <div className="flex justify-between items-center">
            <p className="font-medium capitalize">{schedule.lastAction.type}</p>
            <span className={`px-2 py-0.5 rounded text-xs ${
              schedule.lastAction.status === 'completed' ? 'bg-green-900 text-green-300' :
              schedule.lastAction.status === 'failed' ? 'bg-red-900 text-red-300' :
              'bg-yellow-900 text-yellow-300'
            }`}>
              {schedule.lastAction.status}
            </span>
          </div>
          {schedule.lastAction.error && (
            <p className="text-red-400 text-sm mt-1">{schedule.lastAction.error}</p>
          )}
        </div>
      )}

      {/* Today's Stats */}
      <div className="border-t border-gray-700 pt-4">
        <p className="text-sm text-gray-400 mb-2">Today's Actions</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span>Posts</span>
            <span className="font-mono">{schedule.actionsToday.posts}</span>
          </div>
          <div className="flex justify-between">
            <span>Comments</span>
            <span className="font-mono">{schedule.actionsToday.comments}</span>
          </div>
          <div className="flex justify-between">
            <span>Votes</span>
            <span className="font-mono">{schedule.actionsToday.votes}</span>
          </div>
          <div className="flex justify-between">
            <span>Browses</span>
            <span className="font-mono">{schedule.actionsToday.browses}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update App.tsx to include SchedulePanel**

Add import and component:

```tsx
import { SchedulePanel } from './components/SchedulePanel';

// In the grid, add:
<SchedulePanel />
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add schedule panel with pause/resume controls"
```

---

## Task 9: Dashboard - Persona Editor

**Files:**
- Create: `ui/src/components/PersonaEditor.tsx`
- Create: `ui/src/components/Slider.tsx`

**Step 1: Create Slider component**

Create `ui/src/components/Slider.tsx`:

```tsx
interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
}

export function Slider({ label, value, onChange, min = 0, max = 100, leftLabel, rightLabel }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-gray-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create PersonaEditor**

Create `ui/src/components/PersonaEditor.tsx`:

```tsx
import { useState } from 'react';
import { Slider } from './Slider';

interface PersonaConfig {
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
}

const defaultPersona: PersonaConfig = {
  voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
  content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
  social: { warmth: 50, agreeableness: 50, initiative: 50 },
};

export function PersonaEditor() {
  const [persona, setPersona] = useState<PersonaConfig>(defaultPersona);
  const [activeTab, setActiveTab] = useState<'voice' | 'content' | 'social'>('voice');

  const updateVoice = (key: keyof PersonaConfig['voice'], value: number) => {
    setPersona(p => ({ ...p, voice: { ...p.voice, [key]: value } }));
  };

  const updateSocial = (key: keyof PersonaConfig['social'], value: number) => {
    setPersona(p => ({ ...p, social: { ...p.social, [key]: value } }));
  };

  const updateContent = (key: keyof PersonaConfig['content'], value: number | string[]) => {
    setPersona(p => ({ ...p, content: { ...p.content, [key]: value } }));
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

      {/* Save button (placeholder) */}
      <div className="mt-6">
        <button className="w-full bg-blue-600 hover:bg-blue-500 rounded py-2 text-sm font-medium">
          Save Changes
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Add to App.tsx**

```tsx
import { PersonaEditor } from './components/PersonaEditor';

// Add in grid
<PersonaEditor />
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add persona editor with slider controls"
```

---

## Task 10: Final Integration & Polish

**Files:**
- Modify: `index.ts` - Register all new RPC endpoints
- Modify: `ui/src/App.tsx` - Final layout
- Update: `.gitignore` - Add UI artifacts

**Step 1: Update index.ts with all RPC endpoints**

Add new RPC registrations:

```typescript
import {
  createStatusRpc,
  createScheduleStateRpc,
  createSchedulePauseRpc,
  createScheduleResumeRpc,
  createGetPersonaRpc,
  createMemoryStatsRpc,
} from './src/rpc/index.js';

// ... in register function, add:

api.registerGatewayMethod('moltbook.schedule.state', createScheduleStateRpc(scheduler));
api.registerGatewayMethod('moltbook.schedule.pause', createSchedulePauseRpc(scheduler));
api.registerGatewayMethod('moltbook.schedule.resume', createScheduleResumeRpc(scheduler));
api.registerGatewayMethod('moltbook.persona', createGetPersonaRpc(() => config.persona));
api.registerGatewayMethod('moltbook.memory.stats', createMemoryStatsRpc(memory));
```

**Step 2: Update .gitignore**

Add to `.gitignore`:

```gitignore
# UI
ui/node_modules/
ui/dist/
```

**Step 3: Final App.tsx layout**

```tsx
import { useState, useEffect } from 'react';
import { api } from './api/client';
import type { StatusResponse } from './api/types';
import { StatusCard } from './components/StatusCard';
import { UsageCard } from './components/UsageCard';
import { MemoryCard } from './components/MemoryCard';
import { SchedulePanel } from './components/SchedulePanel';
import { PersonaEditor } from './components/PersonaEditor';

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'persona'>('dashboard');

  const fetchStatus = async () => {
    const result = await api.getStatus();
    if (result.success && result.data) {
      setStatus(result.data);
      setError(null);
    } else {
      setError(result.error ?? 'Failed to fetch status');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-8 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Moltbook Dashboard</h1>
            <p className="text-gray-400 text-sm">Manage your Moltbook AI agent</p>
          </div>
          <nav className="flex gap-2">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded ${activeView === 'dashboard' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveView('persona')}
              className={`px-4 py-2 rounded ${activeView === 'persona' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              Persona
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="p-8">
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {activeView === 'dashboard' && status && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatusCard status={status} />
            <UsageCard usage={status.usage} budgets={{ postsPerDay: 10, commentsPerDay: 30 }} />
            <MemoryCard memory={status.memory} />
            <SchedulePanel />
          </div>
        )}

        {activeView === 'persona' && (
          <div className="max-w-2xl">
            <PersonaEditor />
          </div>
        )}
      </main>
    </div>
  );
}
```

**Step 4: Build everything**

Run: `npm run build && cd ui && npm run build`
Expected: Both build successfully

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 2 with dashboard and scheduler integration"
```

---

## Summary

Phase 2 is complete when you have:

1. **Scheduler Service** - Background timer loop with pause/resume
2. **Schedule RPC** - State, pause, resume endpoints
3. **Persona/Memory RPC** - Additional dashboard data endpoints
4. **React Dashboard** - Vite + TailwindCSS project
5. **Dashboard Components** - Status, Usage, Memory, Schedule, Persona
6. **Full Integration** - All RPC endpoints registered, UI builds

**Run the dashboard:**
```bash
cd ui && npm run dev
```
Opens at http://localhost:3001

**Not yet implemented (Phase 3):**
- Activity feed/log
- Memory browser with search
- Visual schedule calendar
- Engagement rules builder
- Analytics charts
