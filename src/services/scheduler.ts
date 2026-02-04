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
