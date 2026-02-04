import { describe, it, expect, beforeEach } from 'vitest';
import { Scheduler } from '../../src/services/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler({
      posting: { enabled: true, intervalHours: 6, jitterMinutes: 30 },
      browsing: { enabled: true, intervalMinutes: 30 },
      budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    });
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

  it('should track daily action counts', () => {
    const state = scheduler.getState();
    expect(state.actionsToday.posts).toBe(0);
    expect(state.actionsToday.comments).toBe(0);
  });

  it('should record actions and increment counters', () => {
    scheduler.recordAction('post');
    expect(scheduler.getState().actionsToday.posts).toBe(1);
    expect(scheduler.getState().lastAction?.type).toBe('post');
  });

  it('should check if can post based on budget', () => {
    expect(scheduler.canPost()).toBe(true);

    for (let i = 0; i < 10; i++) {
      scheduler.recordAction('post');
    }

    expect(scheduler.canPost()).toBe(false);
  });

  it('should reset daily counters', () => {
    scheduler.recordAction('post');
    scheduler.recordAction('browse');
    expect(scheduler.getState().actionsToday.posts).toBe(1);

    scheduler.resetDailyCounters();
    expect(scheduler.getState().actionsToday.posts).toBe(0);
    expect(scheduler.getState().actionsToday.browses).toBe(0);
  });
});
