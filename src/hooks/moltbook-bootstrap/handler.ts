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
