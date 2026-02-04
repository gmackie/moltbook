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
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

function loadApiKeyFromMoltbookConfig(): string | undefined {
  const moltbookDir = join(homedir(), '.moltbook');
  const configPaths = [
    join(moltbookDir, 'config.json'),
    join(moltbookDir, 'config'),
    join(moltbookDir, 'credentials.json'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        // Try parsing as JSON
        try {
          const parsed = JSON.parse(content);
          if (parsed.apiKey) return parsed.apiKey;
          if (parsed.api_key) return parsed.api_key;
          if (parsed.key) return parsed.key;
        } catch {
          // Not JSON, try as plain text (trimmed)
          const trimmed = content.trim();
          if (trimmed && !trimmed.includes('\n')) {
            return trimmed;
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
  return undefined;
}

export default function register(api: PluginApi) {
  const config = api.config as MoltbookPluginConfig;

  // Try config apiKey first, then fall back to ~/.moltbook/config
  const apiKey = config.apiKey || loadApiKeyFromMoltbookConfig();

  if (!apiKey) {
    api.logger.warn('Moltbook: No API key configured (checked config and ~/.moltbook/)');
    return;
  }

  api.logger.info('Moltbook: Initializing plugin');

  // Initialize services
  const client = new MoltbookClient({ apiKey });

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
