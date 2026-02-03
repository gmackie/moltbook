import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/services/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new Scheduler({
      posting: { enabled: true, intervalHours: 6, jitterMinutes: 30 },
      browsing: { enabled: true, intervalMinutes: 30 },
      budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it('should start and stop cleanly', () => {
    expect(scheduler.getState().running).toBe(false);
    scheduler.start();
    expect(scheduler.getState().running).toBe(true);
    scheduler.stop();
    expect(scheduler.getState().running).toBe(false);
  });

  it('should respect pause state', () => {
    scheduler.start();
    scheduler.pause();
    expect(scheduler.getState().paused).toBe(true);
    scheduler.resume();
    expect(scheduler.getState().paused).toBe(false);
  });

  it('should calculate next action time with jitter', () => {
    scheduler.start();
    const state = scheduler.getState();
    expect(state.nextAction).toBeDefined();
    const maxTime = (6 * 60 + 30) * 60 * 1000;
    const timeDiff = state.nextAction!.scheduledFor.getTime() - Date.now();
    expect(timeDiff).toBeLessThanOrEqual(maxTime);
    expect(timeDiff).toBeGreaterThan(0);
  });

  it('should track daily action counts', () => {
    const state = scheduler.getState();
    expect(state.actionsToday.posts).toBe(0);
    expect(state.actionsToday.comments).toBe(0);
  });
});
