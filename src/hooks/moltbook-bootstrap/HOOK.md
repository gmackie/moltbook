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
