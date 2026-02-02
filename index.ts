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
