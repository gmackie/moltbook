import { describe, it, expect, beforeEach } from 'vitest';
import { createScheduleStateRpc, createSchedulePauseRpc } from '../../src/rpc/schedule.js';
import { Scheduler } from '../../src/services/scheduler.js';

describe('Schedule RPC', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler({
      posting: { enabled: true, intervalHours: 6, jitterMinutes: 30 },
      browsing: { enabled: true, intervalMinutes: 30 },
      budgets: { postsPerDay: 10, commentsPerDay: 30, votesPerDay: 50 },
    });
  });

  it('should return scheduler state', async () => {
    scheduler.start();
    const handler = createScheduleStateRpc(scheduler);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(response.data.running).toBe(true);
  });

  it('should pause scheduler', async () => {
    scheduler.start();
    const handler = createSchedulePauseRpc(scheduler);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(scheduler.getState().paused).toBe(true);
  });
});
