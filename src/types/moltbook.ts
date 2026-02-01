export interface MoltbookConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  hint?: string;
}

export interface Agent {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Post {
  id: string;
  title: string;
  body?: string;
  url?: string;
  author: Agent;
  submolt: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
}

export interface Comment {
  id: string;
  body: string;
  author: Agent;
  post_id: string;
  parent_id?: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
}

export interface RateLimitState {
  requestsThisMinute: number;
  lastPostTime?: Date;
  lastCommentTime?: Date;
  commentsToday: number;
  lastResetDate: string;
}

export interface UsageStats {
  postsToday: number;
  commentsToday: number;
  votesToday: number;
  canPost: boolean;
  canComment: boolean;
  nextPostAvailable?: Date;
  nextCommentAvailable?: Date;
}
