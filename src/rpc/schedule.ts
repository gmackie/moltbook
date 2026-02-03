import type { RpcHandler } from '../types/openclaw.js';
import type { Scheduler } from '../services/scheduler.js';

export interface ScheduleStateResponse {
  running: boolean;
  paused: boolean;
  nextAction?: {
    type: string;
    scheduledFor: string;
  };
  lastAction?: {
    type: string;
    status: string;
    completedAt?: string;
    error?: string;
  };
  actionsToday: {
    posts: number;
    comments: number;
    votes: number;
    browses: number;
  };
}

export function createScheduleStateRpc(scheduler: Scheduler): RpcHandler {
  return async ({ respond }) => {
    const state = scheduler.getState();

    const response: ScheduleStateResponse = {
      running: state.running,
      paused: state.paused,
      nextAction: state.nextAction ? {
        type: state.nextAction.type,
        scheduledFor: state.nextAction.scheduledFor.toISOString(),
      } : undefined,
      lastAction: state.lastAction ? {
        type: state.lastAction.type,
        status: state.lastAction.status,
        error: state.lastAction.error,
      } : undefined,
      actionsToday: state.actionsToday,
    };

    respond(true, response);
  };
}

export function createSchedulePauseRpc(scheduler: Scheduler): RpcHandler {
  return async ({ respond }) => {
    scheduler.pause();
    respond(true, { paused: true });
  };
}

export function createScheduleResumeRpc(scheduler: Scheduler): RpcHandler {
  return async ({ respond }) => {
    scheduler.resume();
    respond(true, { paused: false });
  };
}
