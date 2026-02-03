export interface StatusResponse {
  agent: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string;
  } | null;
  usage: {
    postsToday: number;
    commentsToday: number;
    votesToday: number;
    canPost: boolean;
    canComment: boolean;
    nextPostAvailable?: string;
    nextCommentAvailable?: string;
  };
  memory: {
    conversationCount: number;
    contentCount: number;
    relationshipCount: number;
  };
  state: 'idle' | 'browsing' | 'posting' | 'rate_limited';
  error?: string;
}

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
    error?: string;
  };
  actionsToday: {
    posts: number;
    comments: number;
    votes: number;
    browses: number;
  };
}

export interface RpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
