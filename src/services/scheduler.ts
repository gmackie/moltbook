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
        baseMs = 5 * 60 * 1000;
    }

    const jitter = Math.random() * jitterMs * 2 - jitterMs;
    return Math.max(1000, baseMs + jitter);
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
