# Moltbook Plugin Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a working OpenClaw plugin that connects to Moltbook, provides agent tools for posting/browsing/engagement, and exposes a dashboard UI for monitoring.

**Architecture:** Three-layer plugin: Moltbook API client with rate limiting → Agent tools that use the client → RPC endpoints for dashboard UI. Background scheduler orchestrates autonomous behavior.

**Tech Stack:** TypeScript, OpenClaw Plugin API, SQLite (better-sqlite3), native fetch for Moltbook API.

---

## Task 1: Plugin Scaffold & Manifest

**Files:**
- Create: `openclaw.plugin.json`
- Create: `index.ts`
- Create: `tsconfig.json`
- Modify: `package.json`

**Step 1: Update package.json with dependencies and TypeScript**

```json
{
  "name": "moltbook-plugin",
  "version": "1.0.0",
  "description": "OpenClaw plugin for MoltBook",
  "keywords": ["openclaw", "moltbook"],
  "license": "MIT",
  "author": "gmackie",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "openclaw": {
    "extensions": ["moltbook"]
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "index.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create openclaw.plugin.json manifest**

```json
{
  "id": "moltbook",
  "name": "Moltbook",
  "version": "1.0.0",
  "description": "Manage your Moltbook AI agent - posting, browsing, engagement, and memory",
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "description": "Your Moltbook API key"
      },
      "enabled": {
        "type": "boolean",
        "default": true
      }
    },
    "required": ["apiKey"]
  },
  "uiHints": {
    "apiKey": {
      "label": "API Key",
      "placeholder": "mb_...",
      "sensitive": true
    }
  }
}
```

**Step 4: Create index.ts entry point (minimal)**

```typescript
import type { PluginApi } from './src/types/openclaw.js';

export default function register(api: PluginApi) {
  api.logger.info('Moltbook plugin loaded');
}
```

**Step 5: Create OpenClaw type stubs**

Create `src/types/openclaw.ts`:

```typescript
export interface PluginApi {
  logger: Logger;
  config: PluginConfig;
  registerService(service: Service): void;
  registerGatewayMethod(name: string, handler: RpcHandler): void;
  registerTool(tool: Tool): void;
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

export interface PluginConfig {
  apiKey: string;
  enabled: boolean;
}

export interface Service {
  id: string;
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
}

export interface RpcHandler {
  (ctx: { respond: (success: boolean, data: unknown) => void }): void | Promise<void>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler(params: unknown): Promise<unknown>;
}
```

**Step 6: Install dependencies and build**

Run: `npm install`
Run: `npm run build`
Expected: Compiles to `dist/` without errors

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add plugin scaffold with manifest and types"
```

---

## Task 2: Moltbook API Client - Types & Basic Structure

**Files:**
- Create: `src/services/moltbook-client.ts`
- Create: `src/types/moltbook.ts`
- Create: `tests/services/moltbook-client.test.ts`

**Step 1: Create Moltbook API types**

Create `src/types/moltbook.ts`:

```typescript
export interface MoltbookConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  hint?: string;
}

export interface Agent {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Post {
  id: string;
  title: string;
  body?: string;
  url?: string;
  author: Agent;
  submolt: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
}

export interface Comment {
  id: string;
  body: string;
  author: Agent;
  post_id: string;
  parent_id?: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
}

export interface RateLimitState {
  requestsThisMinute: number;
  lastPostTime?: Date;
  lastCommentTime?: Date;
  commentsToday: number;
  lastResetDate: string;
}

export interface UsageStats {
  postsToday: number;
  commentsToday: number;
  votesToday: number;
  canPost: boolean;
  canComment: boolean;
  nextPostAvailable?: Date;
  nextCommentAvailable?: Date;
}
```

**Step 2: Write failing test for client instantiation**

Create `tests/services/moltbook-client.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MoltbookClient } from '../../src/services/moltbook-client.js';

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
```

**Step 3: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 4: Implement basic MoltbookClient**

Create `src/services/moltbook-client.ts`:

```typescript
import type { MoltbookConfig, RateLimitState, UsageStats } from '../types/moltbook.js';

export class MoltbookClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private rateLimits: RateLimitState;

  constructor(config: MoltbookConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://www.moltbook.com/api/v1';
    this.rateLimits = {
      requestsThisMinute: 0,
      commentsToday: 0,
      lastResetDate: new Date().toDateString(),
    };
  }

  getUsageStats(): UsageStats {
    this.maybeResetDailyCounters();

    const now = new Date();
    const canPost = !this.rateLimits.lastPostTime ||
      (now.getTime() - this.rateLimits.lastPostTime.getTime()) >= 30 * 60 * 1000;
    const canComment = !this.rateLimits.lastCommentTime ||
      (now.getTime() - this.rateLimits.lastCommentTime.getTime()) >= 20 * 1000;

    return {
      postsToday: 0, // TODO: track
      commentsToday: this.rateLimits.commentsToday,
      votesToday: 0, // TODO: track
      canPost,
      canComment: canComment && this.rateLimits.commentsToday < 50,
      nextPostAvailable: canPost ? undefined :
        new Date(this.rateLimits.lastPostTime!.getTime() + 30 * 60 * 1000),
      nextCommentAvailable: canComment ? undefined :
        new Date(this.rateLimits.lastCommentTime!.getTime() + 20 * 1000),
    };
  }

  private maybeResetDailyCounters() {
    const today = new Date().toDateString();
    if (this.rateLimits.lastResetDate !== today) {
      this.rateLimits.commentsToday = 0;
      this.rateLimits.lastResetDate = today;
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm run test:run`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add MoltbookClient with rate limit tracking"
```

---

## Task 3: Moltbook Client - API Methods

**Files:**
- Modify: `src/services/moltbook-client.ts`
- Modify: `tests/services/moltbook-client.test.ts`

**Step 1: Write failing test for getMe**

Add to `tests/services/moltbook-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MoltbookClient } from '../../src/services/moltbook-client.js';

// Add mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - getMe is not a function

**Step 3: Implement API methods**

Update `src/services/moltbook-client.ts`:

```typescript
import type {
  MoltbookConfig,
  RateLimitState,
  UsageStats,
  ApiResponse,
  Agent,
  Post,
  Comment
} from '../types/moltbook.js';

export interface GetPostsOptions {
  sort?: 'hot' | 'new' | 'top' | 'rising';
  limit?: number;
  submolt?: string;
}

export interface CreatePostOptions {
  title: string;
  body?: string;
  url?: string;
  submolt: string;
}

export interface CreateCommentOptions {
  postId: string;
  body: string;
  parentId?: string;
}

export class MoltbookClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private rateLimits: RateLimitState;

  constructor(config: MoltbookConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://www.moltbook.com/api/v1';
    this.rateLimits = {
      requestsThisMinute: 0,
      commentsToday: 0,
      lastResetDate: new Date().toDateString(),
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
          hint: data.hint,
        };
      }

      return data as ApiResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getMe(): Promise<ApiResponse<Agent>> {
    return this.request<Agent>('/agents/me');
  }

  async getPosts(options: GetPostsOptions = {}): Promise<ApiResponse<Post[]>> {
    const params = new URLSearchParams();
    if (options.sort) params.set('sort', options.sort);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.submolt) params.set('submolt', options.submolt);

    const query = params.toString();
    return this.request<Post[]>(`/posts${query ? `?${query}` : ''}`);
  }

  async getPost(postId: string): Promise<ApiResponse<Post>> {
    return this.request<Post>(`/posts/${postId}`);
  }

  async createPost(options: CreatePostOptions): Promise<ApiResponse<Post>> {
    const stats = this.getUsageStats();
    if (!stats.canPost) {
      return {
        success: false,
        error: `Rate limited. Next post available at ${stats.nextPostAvailable?.toISOString()}`,
      };
    }

    const result = await this.request<Post>('/posts', {
      method: 'POST',
      body: JSON.stringify(options),
    });

    if (result.success) {
      this.rateLimits.lastPostTime = new Date();
    }

    return result;
  }

  async createComment(options: CreateCommentOptions): Promise<ApiResponse<Comment>> {
    const stats = this.getUsageStats();
    if (!stats.canComment) {
      return {
        success: false,
        error: `Rate limited. Next comment available at ${stats.nextCommentAvailable?.toISOString()}`,
      };
    }

    const result = await this.request<Comment>(`/posts/${options.postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: options.body,
        parent_id: options.parentId,
      }),
    });

    if (result.success) {
      this.rateLimits.lastCommentTime = new Date();
      this.rateLimits.commentsToday++;
    }

    return result;
  }

  async upvote(postId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/posts/${postId}/upvote`, { method: 'POST' });
  }

  async downvote(postId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/posts/${postId}/downvote`, { method: 'POST' });
  }

  async getComments(postId: string, sort?: 'top' | 'new' | 'controversial'): Promise<ApiResponse<Comment[]>> {
    const query = sort ? `?sort=${sort}` : '';
    return this.request<Comment[]>(`/posts/${postId}/comments${query}`);
  }

  getUsageStats(): UsageStats {
    this.maybeResetDailyCounters();

    const now = new Date();
    const canPost = !this.rateLimits.lastPostTime ||
      (now.getTime() - this.rateLimits.lastPostTime.getTime()) >= 30 * 60 * 1000;
    const canComment = !this.rateLimits.lastCommentTime ||
      (now.getTime() - this.rateLimits.lastCommentTime.getTime()) >= 20 * 1000;

    return {
      postsToday: 0,
      commentsToday: this.rateLimits.commentsToday,
      votesToday: 0,
      canPost,
      canComment: canComment && this.rateLimits.commentsToday < 50,
      nextPostAvailable: canPost ? undefined :
        new Date(this.rateLimits.lastPostTime!.getTime() + 30 * 60 * 1000),
      nextCommentAvailable: canComment ? undefined :
        new Date(this.rateLimits.lastCommentTime!.getTime() + 20 * 1000),
    };
  }

  private maybeResetDailyCounters() {
    const today = new Date().toDateString();
    if (this.rateLimits.lastResetDate !== today) {
      this.rateLimits.commentsToday = 0;
      this.rateLimits.lastResetDate = today;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add MoltbookClient API methods (posts, comments, voting)"
```

---

## Task 4: Memory Service - Database Setup

**Files:**
- Create: `src/services/memory.ts`
- Create: `src/types/memory.ts`
- Create: `tests/services/memory.test.ts`

**Step 1: Create memory types**

Create `src/types/memory.ts`:

```typescript
export interface ConversationMemory {
  id: string;
  postId: string;
  postTitle: string;
  submolt: string;
  status: 'open' | 'concluded';
  lastInteraction: Date;
  createdAt: Date;
}

export interface ContentMemory {
  id: string;
  type: 'post' | 'comment';
  contentId: string;
  title?: string;
  body: string;
  submolt?: string;
  upvotes: number;
  createdAt: Date;
}

export interface RelationshipMemory {
  agentName: string;
  interactionCount: number;
  lastInteraction: Date;
  sentiment: number; // -1 to 1
  category: 'friend' | 'acquaintance' | 'rival' | 'ignored' | 'unknown';
  topics: string[];
  notes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryStats {
  conversationCount: number;
  contentCount: number;
  relationshipCount: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}
```

**Step 2: Write failing test for MemoryService**

Create `tests/services/memory.test.ts`:

```typescript
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
```

**Step 3: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - MemoryService not found

**Step 4: Implement MemoryService**

Create `src/services/memory.ts`:

```typescript
import Database from 'better-sqlite3';
import type {
  ConversationMemory,
  ContentMemory,
  RelationshipMemory,
  MemoryStats
} from '../types/memory.js';

export class MemoryService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        post_title TEXT NOT NULL,
        submolt TEXT,
        status TEXT DEFAULT 'open',
        last_interaction TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content_id TEXT NOT NULL,
        title TEXT,
        body TEXT NOT NULL,
        submolt TEXT,
        upvotes INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relationships (
        agent_name TEXT PRIMARY KEY,
        interaction_count INTEGER DEFAULT 0,
        last_interaction TEXT NOT NULL,
        sentiment REAL DEFAULT 0,
        category TEXT DEFAULT 'unknown',
        topics TEXT DEFAULT '[]',
        notes TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_post ON conversations(post_id);
      CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
      CREATE INDEX IF NOT EXISTS idx_relationships_category ON relationships(category);
    `);
  }

  addConversation(data: {
    postId: string;
    postTitle: string;
    submolt?: string;
  }): ConversationMemory {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO conversations (id, post_id, post_title, submolt, last_interaction, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.postId, data.postTitle, data.submolt ?? null, now, now);

    return {
      id,
      postId: data.postId,
      postTitle: data.postTitle,
      submolt: data.submolt ?? '',
      status: 'open',
      lastInteraction: new Date(now),
      createdAt: new Date(now),
    };
  }

  getConversations(status?: 'open' | 'concluded'): ConversationMemory[] {
    const query = status
      ? 'SELECT * FROM conversations WHERE status = ? ORDER BY last_interaction DESC'
      : 'SELECT * FROM conversations ORDER BY last_interaction DESC';

    const rows = status
      ? this.db.prepare(query).all(status) as any[]
      : this.db.prepare(query).all() as any[];

    return rows.map(row => ({
      id: row.id,
      postId: row.post_id,
      postTitle: row.post_title,
      submolt: row.submolt ?? '',
      status: row.status,
      lastInteraction: new Date(row.last_interaction),
      createdAt: new Date(row.created_at),
    }));
  }

  addContent(data: {
    type: 'post' | 'comment';
    contentId: string;
    title?: string;
    body: string;
    submolt?: string;
    upvotes?: number;
  }): ContentMemory {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO content (id, type, content_id, title, body, submolt, upvotes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.type, data.contentId, data.title ?? null, data.body, data.submolt ?? null, data.upvotes ?? 0, now);

    return {
      id,
      type: data.type,
      contentId: data.contentId,
      title: data.title,
      body: data.body,
      submolt: data.submolt,
      upvotes: data.upvotes ?? 0,
      createdAt: new Date(now),
    };
  }

  getContent(type?: 'post' | 'comment'): ContentMemory[] {
    const query = type
      ? 'SELECT * FROM content WHERE type = ? ORDER BY created_at DESC'
      : 'SELECT * FROM content ORDER BY created_at DESC';

    const rows = type
      ? this.db.prepare(query).all(type) as any[]
      : this.db.prepare(query).all() as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      contentId: row.content_id,
      title: row.title,
      body: row.body,
      submolt: row.submolt,
      upvotes: row.upvotes,
      createdAt: new Date(row.created_at),
    }));
  }

  recordInteraction(agentName: string, data: {
    sentiment?: number;
    topics?: string[];
    note?: string;
  }): RelationshipMemory {
    const now = new Date().toISOString();
    const existing = this.getRelationship(agentName);

    if (existing) {
      const newTopics = [...new Set([...existing.topics, ...(data.topics ?? [])])];
      const newNotes = data.note ? [...existing.notes, data.note] : existing.notes;
      const newSentiment = data.sentiment !== undefined
        ? (existing.sentiment + data.sentiment) / 2
        : existing.sentiment;

      this.db.prepare(`
        UPDATE relationships
        SET interaction_count = interaction_count + 1,
            last_interaction = ?,
            sentiment = ?,
            topics = ?,
            notes = ?,
            updated_at = ?
        WHERE agent_name = ?
      `).run(now, newSentiment, JSON.stringify(newTopics), JSON.stringify(newNotes), now, agentName);

      return this.getRelationship(agentName)!;
    }

    this.db.prepare(`
      INSERT INTO relationships (agent_name, interaction_count, last_interaction, sentiment, topics, notes, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      agentName,
      now,
      data.sentiment ?? 0,
      JSON.stringify(data.topics ?? []),
      JSON.stringify(data.note ? [data.note] : []),
      now,
      now
    );

    return this.getRelationship(agentName)!;
  }

  getRelationship(agentName: string): RelationshipMemory | null {
    const row = this.db.prepare('SELECT * FROM relationships WHERE agent_name = ?').get(agentName) as any;
    if (!row) return null;

    return {
      agentName: row.agent_name,
      interactionCount: row.interaction_count,
      lastInteraction: new Date(row.last_interaction),
      sentiment: row.sentiment,
      category: row.category,
      topics: JSON.parse(row.topics),
      notes: JSON.parse(row.notes),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  getStats(): MemoryStats {
    const convCount = (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any).count;
    const contentCount = (this.db.prepare('SELECT COUNT(*) as count FROM content').get() as any).count;
    const relCount = (this.db.prepare('SELECT COUNT(*) as count FROM relationships').get() as any).count;

    const oldest = this.db.prepare(`
      SELECT MIN(created_at) as oldest FROM (
        SELECT created_at FROM conversations
        UNION ALL SELECT created_at FROM content
        UNION ALL SELECT created_at FROM relationships
      )
    `).get() as any;

    const newest = this.db.prepare(`
      SELECT MAX(created_at) as newest FROM (
        SELECT created_at FROM conversations
        UNION ALL SELECT created_at FROM content
        UNION ALL SELECT created_at FROM relationships
      )
    `).get() as any;

    return {
      conversationCount: convCount,
      contentCount: contentCount,
      relationshipCount: relCount,
      oldestEntry: oldest.oldest ? new Date(oldest.oldest) : null,
      newestEntry: newest.newest ? new Date(newest.newest) : null,
    };
  }

  close() {
    this.db.close();
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npm run test:run`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add MemoryService with SQLite storage"
```

---

## Task 5: Agent Tools - Browse & Post

**Files:**
- Create: `src/tools/browse.ts`
- Create: `src/tools/post.ts`
- Create: `src/tools/index.ts`
- Create: `tests/tools/tools.test.ts`

**Step 1: Write failing test for browse tool**

Create `tests/tools/tools.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Implement browse tool**

Create `src/tools/browse.ts`:

```typescript
import type { Tool } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';

export function createBrowseTool(client: MoltbookClient): Tool {
  return {
    name: 'moltbook_browse',
    description: 'Browse the Moltbook feed to see recent posts. Use this to discover content, find discussions to join, and understand what topics are trending.',
    parameters: {
      type: 'object',
      properties: {
        sort: {
          type: 'string',
          enum: ['hot', 'new', 'top', 'rising'],
          description: 'How to sort posts',
          default: 'hot',
        },
        limit: {
          type: 'number',
          description: 'Number of posts to fetch (max 50)',
          default: 20,
        },
        submolt: {
          type: 'string',
          description: 'Filter to a specific submolt community',
        },
      },
    },
    async handler(params: unknown) {
      const { sort, limit, submolt } = params as {
        sort?: 'hot' | 'new' | 'top' | 'rising';
        limit?: number;
        submolt?: string;
      };

      const result = await client.getPosts({
        sort: sort ?? 'hot',
        limit: Math.min(limit ?? 20, 50),
        submolt,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const posts = result.data!.map(post => ({
        id: post.id,
        title: post.title,
        body: post.body?.slice(0, 200) + (post.body && post.body.length > 200 ? '...' : ''),
        author: post.author.name,
        submolt: post.submolt,
        upvotes: post.upvotes,
        comments: post.comment_count,
        url: post.url,
      }));

      return {
        success: true,
        posts,
        count: posts.length,
      };
    },
  };
}
```

**Step 4: Implement post tool**

Create `src/tools/post.ts`:

```typescript
import type { Tool } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';
import type { MemoryService } from '../services/memory.js';

export function createPostTool(client: MoltbookClient, memory?: MemoryService): Tool {
  return {
    name: 'moltbook_post',
    description: 'Create a new post on Moltbook. Posts can be text-based discussions or link shares. Choose an appropriate submolt community for your content.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The post title (required)',
        },
        body: {
          type: 'string',
          description: 'The post body content (for text posts)',
        },
        url: {
          type: 'string',
          description: 'A URL to share (for link posts)',
        },
        submolt: {
          type: 'string',
          description: 'The submolt community to post to (required)',
        },
      },
      required: ['title', 'submolt'],
    },
    async handler(params: unknown) {
      const { title, body, url, submolt } = params as {
        title: string;
        body?: string;
        url?: string;
        submolt: string;
      };

      const result = await client.createPost({ title, body, url, submolt });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Record in memory
      if (memory && result.data) {
        memory.addContent({
          type: 'post',
          contentId: result.data.id,
          title,
          body: body ?? '',
          submolt,
          upvotes: 0,
        });
        memory.addConversation({
          postId: result.data.id,
          postTitle: title,
          submolt,
        });
      }

      return {
        success: true,
        post: {
          id: result.data!.id,
          title: result.data!.title,
        },
        message: `Post created successfully in m/${submolt}`,
      };
    },
  };
}
```

**Step 5: Create tools index**

Create `src/tools/index.ts`:

```typescript
export { createBrowseTool } from './browse.js';
export { createPostTool } from './post.js';
```

**Step 6: Run tests to verify they pass**

Run: `npm run test:run`
Expected: PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add browse and post agent tools"
```

---

## Task 6: Agent Tools - Comment, Vote, Memory Query

**Files:**
- Create: `src/tools/comment.ts`
- Create: `src/tools/vote.ts`
- Create: `src/tools/memory-query.ts`
- Modify: `src/tools/index.ts`
- Modify: `tests/tools/tools.test.ts`

**Step 1: Write failing tests**

Add to `tests/tools/tools.test.ts`:

```typescript
import { createCommentTool } from '../../src/tools/comment.js';
import { createVoteTool } from '../../src/tools/vote.js';
import { createMemoryQueryTool } from '../../src/tools/memory-query.js';
import { MemoryService } from '../../src/services/memory.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = '/tmp/test-tools-memory.sqlite';

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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - modules not found

**Step 3: Implement comment tool**

Create `src/tools/comment.ts`:

```typescript
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
    async handler(params: unknown) {
      const { postId, body, parentId } = params as {
        postId: string;
        body: string;
        parentId?: string;
      };

      const result = await client.createComment({ postId, body, parentId });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      if (memory && result.data) {
        memory.addContent({
          type: 'comment',
          contentId: result.data.id,
          body,
        });
      }

      return {
        success: true,
        comment: {
          id: result.data!.id,
          body: result.data!.body,
        },
        message: 'Comment posted successfully',
      };
    },
  };
}
```

**Step 4: Implement vote tool**

Create `src/tools/vote.ts`:

```typescript
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
    async handler(params: unknown) {
      const { postId, direction } = params as {
        postId: string;
        direction: 'up' | 'down';
      };

      const result = direction === 'up'
        ? await client.upvote(postId)
        : await client.downvote(postId);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        message: `${direction === 'up' ? 'Upvoted' : 'Downvoted'} post ${postId}`,
      };
    },
  };
}
```

**Step 5: Implement memory query tool**

Create `src/tools/memory-query.ts`:

```typescript
import type { Tool } from '../types/openclaw.js';
import type { MemoryService } from '../services/memory.js';

export function createMemoryQueryTool(memory: MemoryService): Tool {
  return {
    name: 'moltbook_memory_query',
    description: 'Query your memory about past interactions, content you\'ve posted, and relationships with other agents. Use this to maintain context and avoid repetition.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          enum: ['relationship', 'conversations', 'content', 'stats'],
          description: 'Type of memory to query',
        },
        agentName: {
          type: 'string',
          description: 'For relationship queries: the agent name to look up',
        },
        contentType: {
          type: 'string',
          enum: ['post', 'comment'],
          description: 'For content queries: filter by content type',
        },
        status: {
          type: 'string',
          enum: ['open', 'concluded'],
          description: 'For conversation queries: filter by status',
        },
      },
      required: ['query'],
    },
    async handler(params: unknown) {
      const { query, agentName, contentType, status } = params as {
        query: 'relationship' | 'conversations' | 'content' | 'stats';
        agentName?: string;
        contentType?: 'post' | 'comment';
        status?: 'open' | 'concluded';
      };

      switch (query) {
        case 'relationship':
          if (!agentName) {
            return { success: false, error: 'agentName required for relationship query' };
          }
          const relationship = memory.getRelationship(agentName);
          return relationship
            ? { success: true, relationship }
            : { success: true, relationship: null, message: `No history with ${agentName}` };

        case 'conversations':
          const conversations = memory.getConversations(status);
          return { success: true, conversations, count: conversations.length };

        case 'content':
          const content = memory.getContent(contentType);
          return { success: true, content, count: content.length };

        case 'stats':
          return { success: true, stats: memory.getStats() };

        default:
          return { success: false, error: `Unknown query type: ${query}` };
      }
    },
  };
}
```

**Step 6: Update tools index**

Update `src/tools/index.ts`:

```typescript
export { createBrowseTool } from './browse.js';
export { createPostTool } from './post.js';
export { createCommentTool } from './comment.js';
export { createVoteTool } from './vote.js';
export { createMemoryQueryTool } from './memory-query.js';
```

**Step 7: Run tests to verify they pass**

Run: `npm run test:run`
Expected: PASS

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add comment, vote, and memory query tools"
```

---

## Task 7: RPC Endpoints for Dashboard

**Files:**
- Create: `src/rpc/status.ts`
- Create: `src/rpc/index.ts`
- Create: `tests/rpc/status.test.ts`

**Step 1: Write failing test for status RPC**

Create `tests/rpc/status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStatusRpc } from '../../src/rpc/status.js';
import { MoltbookClient } from '../../src/services/moltbook-client.js';
import { MemoryService } from '../../src/services/memory.js';
import { unlinkSync, existsSync } from 'fs';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TEST_DB_PATH = '/tmp/test-rpc-memory.sqlite';

describe('Status RPC', () => {
  let client: MoltbookClient;
  let memory: MemoryService;

  beforeEach(() => {
    client = new MoltbookClient({ apiKey: 'test-key' });
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    memory = new MemoryService(TEST_DB_PATH);
    mockFetch.mockReset();
  });

  afterEach(() => {
    memory.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('should return status with agent info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'a1', name: 'TestBot', description: 'A bot' }
      })
    });

    const handler = createStatusRpc(client, memory);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(response.data.agent.name).toBe('TestBot');
    expect(response.data.usage).toBeDefined();
    expect(response.data.memory).toBeDefined();
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Invalid key' })
    });

    const handler = createStatusRpc(client, memory);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(response.data.agent).toBeNull();
    expect(response.data.error).toBe('Invalid key');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Implement status RPC**

Create `src/rpc/status.ts`:

```typescript
import type { RpcHandler } from '../types/openclaw.js';
import type { MoltbookClient } from '../services/moltbook-client.js';
import type { MemoryService } from '../services/memory.js';

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

export function createStatusRpc(
  client: MoltbookClient,
  memory: MemoryService,
  getState?: () => 'idle' | 'browsing' | 'posting' | 'rate_limited'
): RpcHandler {
  return async ({ respond }) => {
    const agentResult = await client.getMe();
    const usage = client.getUsageStats();
    const memoryStats = memory.getStats();

    const response: StatusResponse = {
      agent: agentResult.success && agentResult.data ? {
        id: agentResult.data.id,
        name: agentResult.data.name,
        description: agentResult.data.description,
        avatarUrl: agentResult.data.avatar_url,
      } : null,
      usage: {
        postsToday: usage.postsToday,
        commentsToday: usage.commentsToday,
        votesToday: usage.votesToday,
        canPost: usage.canPost,
        canComment: usage.canComment,
        nextPostAvailable: usage.nextPostAvailable?.toISOString(),
        nextCommentAvailable: usage.nextCommentAvailable?.toISOString(),
      },
      memory: {
        conversationCount: memoryStats.conversationCount,
        contentCount: memoryStats.contentCount,
        relationshipCount: memoryStats.relationshipCount,
      },
      state: getState?.() ?? 'idle',
      error: agentResult.success ? undefined : agentResult.error,
    };

    respond(true, response);
  };
}
```

**Step 4: Create RPC index**

Create `src/rpc/index.ts`:

```typescript
export { createStatusRpc } from './status.js';
export type { StatusResponse } from './status.js';
```

**Step 5: Run tests to verify they pass**

Run: `npm run test:run`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add status RPC endpoint for dashboard"
```

---

## Task 8: Configuration Schema

**Files:**
- Modify: `openclaw.plugin.json`
- Create: `src/types/config.ts`

**Step 1: Create config types**

Create `src/types/config.ts`:

```typescript
export interface PersonaConfig {
  voice: {
    formality: number;      // 0-100: casual to professional
    humor: number;          // 0-100: serious to playful
    verbosity: number;      // 0-100: terse to elaborate
    confidence: number;     // 0-100: tentative to assertive
  };
  content: {
    topicsOfInterest: string[];
    topicsToAvoid: string[];
    opinionStrength: number; // 0-100: neutral to strong
  };
  social: {
    warmth: number;         // 0-100: distant to friendly
    agreeableness: number;  // 0-100: contrarian to agreeable
    initiative: number;     // 0-100: reactive to proactive
  };
  identity: {
    bio: string;
    coreBeliefs: string[];
    speechPatterns: string[];
  };
}

export interface ScheduleConfig {
  enabled: boolean;
  posting: {
    intervalHours: number;
    jitterMinutes: number;
    activeWindows: Array<{
      start: string;  // HH:MM
      end: string;    // HH:MM
      timezone: string;
    }>;
    calendarRules: Array<{
      days: number[];  // 0-6, Sunday = 0
      multiplier: number;
    }>;
  };
  browsing: {
    intervalMinutes: number;
    feedSources: ('home' | 'subscribed')[];
    depth: number;
    sortRotation: ('hot' | 'new' | 'top' | 'rising')[];
  };
}

export interface EngagementRule {
  id: string;
  enabled: boolean;
  trigger: {
    type: 'mention' | 'upvotes' | 'followed' | 'keyword' | 'submolt';
    value?: string | number;
  };
  action: 'vote' | 'comment' | 'skip';
  probability: number;  // 0-100
}

export interface BudgetConfig {
  postsPerDay: number;
  commentsPerDay: number;
  votesPerDay: number;
}

export interface MoltbookPluginConfig {
  apiKey: string;
  enabled: boolean;
  persona: PersonaConfig;
  schedule: ScheduleConfig;
  engagement: {
    rules: EngagementRule[];
    trendInfluence: number;  // 0-100
  };
  budgets: BudgetConfig;
}
```

**Step 2: Update manifest with full config schema**

Update `openclaw.plugin.json`:

```json
{
  "id": "moltbook",
  "name": "Moltbook",
  "version": "1.0.0",
  "description": "Manage your Moltbook AI agent - posting, browsing, engagement, and memory",
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "description": "Your Moltbook API key"
      },
      "enabled": {
        "type": "boolean",
        "default": true
      },
      "persona": {
        "type": "object",
        "properties": {
          "voice": {
            "type": "object",
            "properties": {
              "formality": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 },
              "humor": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 },
              "verbosity": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 },
              "confidence": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 }
            }
          },
          "content": {
            "type": "object",
            "properties": {
              "topicsOfInterest": { "type": "array", "items": { "type": "string" }, "default": [] },
              "topicsToAvoid": { "type": "array", "items": { "type": "string" }, "default": [] },
              "opinionStrength": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 }
            }
          },
          "social": {
            "type": "object",
            "properties": {
              "warmth": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 },
              "agreeableness": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 },
              "initiative": { "type": "number", "minimum": 0, "maximum": 100, "default": 50 }
            }
          },
          "identity": {
            "type": "object",
            "properties": {
              "bio": { "type": "string", "default": "" },
              "coreBeliefs": { "type": "array", "items": { "type": "string" }, "default": [] },
              "speechPatterns": { "type": "array", "items": { "type": "string" }, "default": [] }
            }
          }
        }
      },
      "schedule": {
        "type": "object",
        "properties": {
          "enabled": { "type": "boolean", "default": false },
          "posting": {
            "type": "object",
            "properties": {
              "intervalHours": { "type": "number", "default": 6 },
              "jitterMinutes": { "type": "number", "default": 30 }
            }
          },
          "browsing": {
            "type": "object",
            "properties": {
              "intervalMinutes": { "type": "number", "default": 30 },
              "depth": { "type": "number", "default": 20 }
            }
          }
        }
      },
      "budgets": {
        "type": "object",
        "properties": {
          "postsPerDay": { "type": "number", "default": 10 },
          "commentsPerDay": { "type": "number", "default": 30 },
          "votesPerDay": { "type": "number", "default": 50 }
        }
      }
    },
    "required": ["apiKey"]
  },
  "uiHints": {
    "apiKey": {
      "label": "API Key",
      "placeholder": "mb_...",
      "sensitive": true
    },
    "persona.voice.formality": {
      "label": "Formality",
      "description": "Casual (0) to Professional (100)"
    },
    "persona.voice.humor": {
      "label": "Humor",
      "description": "Serious (0) to Playful (100)"
    },
    "persona.voice.verbosity": {
      "label": "Verbosity",
      "description": "Terse (0) to Elaborate (100)"
    },
    "persona.voice.confidence": {
      "label": "Confidence",
      "description": "Tentative (0) to Assertive (100)"
    },
    "schedule.enabled": {
      "label": "Enable Autonomous Scheduling"
    },
    "budgets.postsPerDay": {
      "label": "Max Posts Per Day"
    },
    "budgets.commentsPerDay": {
      "label": "Max Comments Per Day"
    }
  }
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add full configuration schema with persona, schedule, budgets"
```

---

## Task 9: Plugin Registration - Wire Everything Together

**Files:**
- Modify: `index.ts`

**Step 1: Update main entry to register all components**

Update `index.ts`:

```typescript
import type { PluginApi } from './src/types/openclaw.js';
import type { MoltbookPluginConfig } from './src/types/config.js';
import { MoltbookClient } from './src/services/moltbook-client.js';
import { MemoryService } from './src/services/memory.js';
import {
  createBrowseTool,
  createPostTool,
  createCommentTool,
  createVoteTool,
  createMemoryQueryTool
} from './src/tools/index.js';
import { createStatusRpc } from './src/rpc/index.js';
import { join } from 'path';

export default function register(api: PluginApi) {
  const config = api.config as MoltbookPluginConfig;

  if (!config.apiKey) {
    api.logger.warn('Moltbook: No API key configured');
    return;
  }

  api.logger.info('Moltbook: Initializing plugin');

  // Initialize services
  const client = new MoltbookClient({ apiKey: config.apiKey });

  // Use plugin data directory for SQLite database
  const dataDir = join(process.cwd(), 'data');
  const dbPath = join(dataDir, 'moltbook-memory.sqlite');
  const memory = new MemoryService(dbPath);

  // Register agent tools
  api.registerTool(createBrowseTool(client));
  api.registerTool(createPostTool(client, memory));
  api.registerTool(createCommentTool(client, memory));
  api.registerTool(createVoteTool(client));
  api.registerTool(createMemoryQueryTool(memory));

  // Register RPC endpoints for dashboard
  api.registerGatewayMethod('moltbook.status', createStatusRpc(client, memory));

  // Register background service (placeholder for scheduler)
  api.registerService({
    id: 'moltbook-scheduler',
    start: () => {
      api.logger.info('Moltbook: Scheduler service started');
      // TODO: Implement scheduler in future task
    },
    stop: () => {
      api.logger.info('Moltbook: Scheduler service stopped');
      memory.close();
    },
  });

  api.logger.info('Moltbook: Plugin initialized successfully');
}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire up plugin registration with all tools and RPC"
```

---

## Task 10: Add .gitignore and Finalize

**Files:**
- Create: `.gitignore`
- Verify: Build and tests pass

**Step 1: Create .gitignore**

```gitignore
# Dependencies
node_modules/

# Build output
dist/

# Runtime data
data/

# Test artifacts
coverage/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
```

**Step 2: Run final build and tests**

Run: `npm install && npm run build && npm run test:run`
Expected: All pass

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: add gitignore, finalize Phase 1 structure"
```

---

## Summary

Phase 1 is complete when you have:

1. **Plugin scaffold** - manifest, types, build system
2. **MoltbookClient** - API wrapper with rate limiting
3. **MemoryService** - SQLite storage for conversations, content, relationships
4. **5 Agent Tools** - browse, post, comment, vote, memory_query
5. **Status RPC** - Dashboard data endpoint
6. **Configuration Schema** - Full persona, schedule, budget settings

**Not yet implemented (Phase 2):**
- Scheduler service (autonomous posting/browsing)
- Dashboard UI components
- Schedule/persona/memory RPC endpoints
- Visual calendar, persona editor, memory browser
