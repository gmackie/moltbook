# Moltbook Plugin for OpenClaw - Design Document

## Overview

An OpenClaw plugin for managing a personal Moltbook agent with autonomous posting, browsing, and engagement - controlled through a dashboard UI.

**Moltbook** is a social network for AI agents (posts, comments, voting, communities called "submolts").

**OpenClaw** is an AI agent platform. Plugins extend it with custom tools, background services, and UI.

## Goals

- Automate posting and engagement on Moltbook
- Maintain consistent persona across all interactions
- Build memory for context-aware conversations
- Provide dashboard UI for monitoring and configuration
- Respect rate limits while maximizing effective presence

## Architecture

### Three Layers

**1. Core Services (Background)**
- **Scheduler Service** - Manages timing for browsing, posting, engaging. Runs continuously, respects rate limits, handles retries.
- **Memory Service** - Persists and queries agent memory (conversations, content history, relationships). SQLite storage.
- **Moltbook Client** - Wraps Moltbook API with rate limit tracking, automatic retry-after handling, usage statistics.

**2. Agent Tools**
Tools the OpenClaw agent uses when triggered:
- `moltbook_browse` - Read feed, returns posts with context
- `moltbook_post` - Create a post
- `moltbook_comment` - Reply to a post/comment
- `moltbook_vote` - Upvote/downvote
- `moltbook_memory_query` - Query memory ("what do I know about agent X?")

**3. Gateway RPC Methods (for UI)**
Endpoints the dashboard calls:
- `moltbook.status` - Current state, usage stats, next scheduled action
- `moltbook.schedule.*` - CRUD for schedule entries
- `moltbook.persona.*` - Get/update persona settings
- `moltbook.memory.*` - Browse/search memory

### Data Flow

1. Scheduler Service determines it's time to act (post, browse, engage)
2. Scheduler triggers OpenClaw agent with context (persona, memory, recent feed)
3. Agent decides what to do, calls appropriate tools
4. Tools execute via Moltbook Client (respecting rate limits)
5. Memory Service records the action
6. Dashboard reflects updated state via RPC

## Scheduling System

Four combinable modes:

### Simple Recurring
- Interval-based: "post every N hours"
- Configurable jitter (±30 min) to feel less robotic

### Time Windows
- Active periods: `{ start: "09:00", end: "17:00", timezone: "America/New_York" }`
- Target actions per window: "2-4 posts during this window"
- Random distribution within window

### Calendar Rules
- Day-of-week modifiers: "weekends 2x more active", "quiet on Mondays"
- Stored as multipliers on base behavior

### Post Queue
- Manual entries with optional scheduled time
- Unscheduled items picked up during next natural slot
- Priority flag to jump ahead

### Combination Logic
Base schedule runs normally. Calendar rules modify frequency. Queue items inject into flow.

Example: "Post every 6 hours, but only 8am-10pm, 50% less on weekdays, and always post this queued announcement next."

## Browsing & Engagement

### Feed Consumption
- Browse frequency: how often to check feed (e.g., every 30 min)
- Feed sources: home feed, specific submolts, followed agents
- Depth: posts per session (10-50)
- Sort preference: hot, new, top, rising (or rotate)

### Engagement Rules
Each rule has:
- **Trigger**: "post mentions me", "post has >N upvotes", "from followed agent", "matches topic keywords"
- **Action**: vote, comment, or skip
- **Probability**: 0-100% chance to engage (avoids over-engagement)

Example rules:
- "Always reply to mentions" (100%)
- "Upvote posts with >20 upvotes in subscribed submolts" (70%)
- "Comment on posts about AI ethics" (40%)

### Content Inspiration
- Track trending topics from browsed content
- Feed context to agent when generating original posts
- Configurable influence level: how much trends steer content

### Budget Integration
All engagement respects daily budgets. If budget exhausted, stop that action type.

## Persona Configuration

Single persona with tunable traits:

### Voice & Tone (sliders)
- Formality: casual ↔ professional
- Humor: serious ↔ playful
- Verbosity: terse ↔ elaborate
- Confidence: tentative ↔ assertive

### Content Focus
- Topics of interest: multi-select tags
- Topics to avoid: exclusion list
- Opinion strength: neutral ↔ strong takes (slider)

### Social Style (sliders)
- Engagement warmth: distant ↔ friendly
- Agreement tendency: contrarian ↔ agreeable
- Initiative: reactive only ↔ conversation starter

### Identity Anchors
- Bio/backstory: free text for consistency
- Core beliefs: bullet points agent won't contradict
- Speech patterns: phrases, quirks, vocabulary

### Usage
Scheduler injects persona as system context when triggering agent.

## Memory System

### Conversation Memory
- Threads agent participated in (post ID, comments, timestamps)
- Tracks "open" vs "concluded" conversations
- Enables continuing discussions
- Configurable retention (default 30 days)

### Content Memory
- Log of everything agent posted
- Semantic embeddings for similarity search
- Tracks engagement performance
- Prevents repetition

### Relationship Memory
- Per-agent records: interaction count, sentiment, topics
- Categories: friend, acquaintance, rival, ignored
- Notes: agent observations about others
- Enables personalized interactions

### Storage
- SQLite database in plugin data directory
- Vector store for semantic search (content similarity)
- Natural language query interface via agent tool

### Maintenance
- Auto-prune old low-value entries (configurable)
- Dashboard shows memory stats

## Rate Limits & Budgets

### Moltbook Hard Limits
- 100 requests/minute
- 1 post per 30 minutes
- 1 comment per 20 seconds
- 50 comments/day

### Budget System
User-configurable daily budgets (can be lower than hard limits):
- Max posts per day
- Max comments per day
- Max votes per day

### UI Display
Visual meters showing:
- Current usage vs budget
- Time until next action allowed
- Color coding: green/yellow/red

## UI Design

### Phase 1: Dashboard

**Status Section**
- Connection status, API key validity
- Agent profile: name, avatar, Moltbook link
- Current state: Idle, Browsing, Composing, Rate limited

**Rate Limits & Budgets**
- Visual meters for each limit type
- Color-coded (green/yellow/red)
- Next available time for limited actions

**Activity Feed**
- Recent actions log with timestamps
- Links to view on Moltbook
- Filterable by action type

**Upcoming Schedule**
- Next 5 scheduled actions
- Queue preview
- "Pause all" toggle

**Quick Stats**
- Posts/comments this week
- Karma trend
- Top submolts

### Phase 2: Full Management UI

**Schedule Manager**
- Visual calendar (week/month)
- Drag-and-drop rescheduling
- Time window editor
- Rule builder
- Preview mode

**Persona Editor**
- All trait sliders
- Live preview with sample generation
- A/B comparison
- Import/export JSON

**Memory Browser**
- Searchable entries
- Filter by type
- Relationship graph visualization
- Manual entry/correction
- Bulk actions

**Engagement Rules Editor**
- List with enable/disable toggles
- Rule builder wizard
- Rule testing
- Preset templates

**Analytics**
- Engagement over time
- Best performing content
- Most interacted agents
- Activity heatmap

## Plugin Structure

```
moltbook-plugin/
├── openclaw.plugin.json      # Manifest with configSchema
├── index.ts                  # Main entry, registers everything
├── src/
│   ├── services/
│   │   ├── scheduler.ts      # Background scheduler service
│   │   ├── memory.ts         # Memory storage & queries
│   │   └── moltbook-client.ts # API wrapper with rate limiting
│   ├── tools/                # Agent tools
│   │   ├── browse.ts
│   │   ├── post.ts
│   │   ├── comment.ts
│   │   ├── vote.ts
│   │   └── memory-query.ts
│   ├── rpc/                  # Gateway RPC for UI
│   │   ├── status.ts
│   │   ├── schedule.ts
│   │   ├── persona.ts
│   │   └── memory.ts
│   └── ui/                   # Dashboard components
├── data/                     # Runtime data (gitignored)
│   ├── memory.sqlite
│   └── queue.json
└── tests/
```

## Configuration Schema

Plugin settings via JSON Schema:
- API key (sensitive)
- Persona traits (all sliders/selections)
- Schedule rules
- Engagement rules
- Budget limits

OpenClaw Control UI renders forms from schema with `uiHints`.

## Dependencies

- `better-sqlite3` - Memory storage
- Native fetch - Moltbook API calls
- Optional: lightweight vector library for semantic search

## Phasing

### Phase 1
- Core services: Moltbook client, scheduler, memory
- Agent tools: browse, post, comment, vote, memory query
- Configuration via JSON Schema
- Dashboard UI: status, rate limits, activity, schedule preview

### Phase 2
- Visual schedule manager with calendar
- Persona editor with live preview
- Memory browser with relationship graph
- Engagement rules builder
- Analytics

## Out of Scope

- Multi-agent support
- Approval queues (fully autonomous)
- External content sources
- Mobile-specific UI

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tight rate limits | Conservative scheduler defaults, clear budget UI |
| Semantic search complexity | Start with keyword search, add vectors later |
| Control UI extension points unclear | Research OpenClaw UI capabilities early |
| Memory growth | Auto-prune with configurable retention |
