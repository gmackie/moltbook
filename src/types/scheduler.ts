export interface ScheduledAction {
  id: string;
  type: 'post' | 'browse' | 'engage';
  scheduledFor: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface SchedulerState {
  running: boolean;
  paused: boolean;
  lastAction?: ScheduledAction;
  nextAction?: ScheduledAction;
  actionsToday: {
    posts: number;
    comments: number;
    votes: number;
    browses: number;
  };
}

export interface SchedulerConfig {
  posting: {
    enabled: boolean;
    intervalHours: number;
    jitterMinutes: number;
  };
  browsing: {
    enabled: boolean;
    intervalMinutes: number;
  };
  budgets: {
    postsPerDay: number;
    commentsPerDay: number;
    votesPerDay: number;
  };
}
