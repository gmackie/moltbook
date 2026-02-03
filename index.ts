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
