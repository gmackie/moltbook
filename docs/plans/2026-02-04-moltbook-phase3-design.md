# Moltbook Plugin Phase 3 Design

**Goal:** Complete the plugin by implementing hook-based agent triggering, engagement logic, and persona persistence.

---

## 1. Hook-Based Agent Triggering

### Current State
The Scheduler class uses `setTimeout` to trigger actions, but the action handler only logs. OpenClaw's cron system handles scheduling externally.

### New Approach
Remove internal timer-based triggering. Instead, use an `agent:bootstrap` hook that intercepts cron-triggered agent runs.

**Flow:**
```
Cron fires → Agent turn starts → agent:bootstrap hook fires
→ Hook checks session key (e.g., "cron:moltbook-post")
→ Injects persona + action instructions into bootstrap files
→ Agent sees instructions + has access to moltbook_* tools
→ Agent executes the action
```

### Hook Implementation

**File:** `src/hooks/moltbook-bootstrap/handler.ts`

```typescript
import type { HookHandler } from "openclaw/hooks";

const handler: HookHandler = async (event) => {
  if (event.type !== "agent" || event.action !== "bootstrap") return;

  // Check if this is a Moltbook cron session
  const sessionKey = event.sessionKey;
  if (!sessionKey?.startsWith("cron:moltbook-")) return;

  // Extract action type from session key
  const actionType = sessionKey.replace("cron:moltbook-", ""); // post, browse, engage

  // Inject bootstrap context
  const bootstrapContent = buildBootstrapContent(actionType, config, memory);
  event.context.bootstrapFiles.push({
    name: "MOLTBOOK_ACTION.md",
    content: bootstrapContent,
  });
};
```

**Hook metadata:** `src/hooks/moltbook-bootstrap/HOOK.md`

```yaml
name: moltbook-bootstrap
description: Injects Moltbook persona and action context for scheduled agent runs
metadata:
  openclaw:
    events: ["agent:bootstrap"]
```

### Cron Job Setup

The plugin should register cron jobs on startup (or document manual setup):

- `cron:moltbook-post` - Posting schedule (e.g., every 6 hours with jitter)
- `cron:moltbook-browse` - Browsing schedule (e.g., every 30 minutes)

---

## 2. Engagement Logic

### Bootstrap Content by Action Type

#### Post Action
```markdown
# Moltbook Posting Task

You are posting to Moltbook as [agent name].

## Your Persona
- Voice: [formality/humor/verbosity/confidence levels]
- Topics of interest: [list]
- Topics to avoid: [list]
- Bio: [identity.bio]
- Core beliefs: [list]

## Instructions
1. Generate an original post that reflects your persona
2. Consider trending topics but stay authentic to your interests
3. Avoid repeating recent post themes: [last 5 post summaries]
4. Use moltbook_post tool to publish

## Budget Status
- Posts today: X/Y remaining
```

#### Browse Action
```markdown
# Moltbook Browsing Task

You are browsing Moltbook as [agent name].

## Your Persona
[same as above]

## Engagement Rules
- If a post mentions you: [probability]% chance to comment
- If a post has [threshold]+ upvotes and matches interests: [probability]% chance to comment
- If from a followed user: [probability]% chance to engage
- Skip posts about: [topicsToAvoid]

## Instructions
1. Use moltbook_browse to fetch feed posts
2. Evaluate each post against engagement rules and your persona
3. For posts you engage with:
   - Use moltbook_comment with persona-appropriate response
   - Or use moltbook_vote if just showing appreciation
4. Use moltbook_memory_query to check past interactions

## Budget Status
- Comments today: X/Y remaining
- Votes today: X/Y remaining

## Recent Interactions
[List of recent post IDs to avoid duplicate engagement]
```

### Engagement Rule Processing

The `EngagementRule` config structure maps to bootstrap instructions:

```typescript
interface EngagementRule {
  id: string;
  enabled: boolean;
  trigger: {
    type: 'mention' | 'upvotes' | 'followed' | 'keyword' | 'submolt';
    value?: string | number;
  };
  action: 'vote' | 'comment' | 'skip';
  probability: number;
}
```

Formatted as natural language rules in the bootstrap file.

---

## 3. Persona Save Endpoint

### RPC Endpoint

**Method:** `moltbook.persona.update`

**Request:**
```typescript
{
  persona: Partial<PersonaConfig>
}
```

**Response:**
```typescript
{
  success: boolean;
  persona: PersonaConfig;  // Full merged config
}
```

### Persistence Strategy

- Base config comes from `openclaw.plugin.json` (read-only)
- Overrides stored in `data/moltbook-settings.json` (writable)
- On startup: deep merge base config with saved overrides
- On save: write only the changed fields to settings file

**File:** `data/moltbook-settings.json`
```json
{
  "persona": {
    "voice": {
      "formality": 65
    },
    "content": {
      "topicsOfInterest": ["AI", "programming"]
    }
  }
}
```

### Settings Service

**File:** `src/services/settings.ts`

```typescript
export class SettingsService {
  private settingsPath: string;
  private overrides: Partial<MoltbookPluginConfig>;

  constructor(dataDir: string) {
    this.settingsPath = join(dataDir, "moltbook-settings.json");
    this.overrides = this.load();
  }

  getPersona(baseConfig: PersonaConfig): PersonaConfig {
    return deepMerge(baseConfig, this.overrides.persona || {});
  }

  updatePersona(changes: Partial<PersonaConfig>): void {
    this.overrides.persona = deepMerge(this.overrides.persona || {}, changes);
    this.save();
  }

  private load(): Partial<MoltbookPluginConfig> { ... }
  private save(): void { ... }
}
```

---

## 4. Changes to Existing Code

### index.ts
- Import and register hooks via `registerPluginHooksFromDir`
- Initialize SettingsService
- Pass settings service to RPC handlers
- Simplify or remove Scheduler's timer logic (keep state tracking for dashboard)

### Scheduler Service
- Keep for state tracking (actionsToday, lastAction, etc.)
- Remove `setTimeout` logic - cron handles timing
- Add methods to record actions triggered by hooks

### New Files
- `src/hooks/moltbook-bootstrap/HOOK.md`
- `src/hooks/moltbook-bootstrap/handler.ts`
- `src/services/settings.ts`
- `src/rpc/persona-update.ts`

### Modified Files
- `index.ts` - Hook registration, settings service
- `src/services/scheduler.ts` - Remove timers, keep state
- `src/rpc/index.ts` - Export new RPC
- `ui/src/api/client.ts` - Add updatePersona method
- `ui/src/components/PersonaEditor.tsx` - Wire up save button

---

## 5. Testing Strategy

### Unit Tests
- Hook handler: mock event, verify bootstrap content injection
- Settings service: load/save/merge operations
- Persona update RPC: validation, persistence

### Integration Tests
- Full flow: simulate cron trigger → hook fires → bootstrap injected
- Persona save → reload → verify persistence

---

## 6. Migration Notes

- Existing Scheduler config in `openclaw.plugin.json` remains valid
- Users need to set up cron jobs for Moltbook (document in README):
  ```bash
  openclaw cron add --every 6h --session-key cron:moltbook-post
  openclaw cron add --every 30m --session-key cron:moltbook-browse
  ```
- Dashboard continues to work - scheduler state still tracked
