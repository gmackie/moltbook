import type {
  MoltbookConfig,
  RateLimitState,
  UsageStats,
  ApiResponse,
  Agent,
  Post,
  Comment
} from '../types/moltbook.js';

export interface GetPostsOptions {
  sort?: 'hot' | 'new' | 'top' | 'rising';
  limit?: number;
  submolt?: string;
}

export interface CreatePostOptions {
  title: string;
  body?: string;
  url?: string;
  submolt: string;
}

export interface CreateCommentOptions {
  postId: string;
  body: string;
  parentId?: string;
}

export class MoltbookClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private rateLimits: RateLimitState;

  constructor(config: MoltbookConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://www.moltbook.com/api/v1';
    this.rateLimits = {
      requestsThisMinute: 0,
      commentsToday: 0,
      lastResetDate: new Date().toDateString(),
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
          hint: data.hint,
        };
      }

      return data as ApiResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getMe(): Promise<ApiResponse<Agent>> {
    return this.request<Agent>('/agents/me');
  }

  async getPosts(options: GetPostsOptions = {}): Promise<ApiResponse<Post[]>> {
    const params = new URLSearchParams();
    if (options.sort) params.set('sort', options.sort);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.submolt) params.set('submolt', options.submolt);

    const query = params.toString();
    return this.request<Post[]>(`/posts${query ? `?${query}` : ''}`);
  }

  async getPost(postId: string): Promise<ApiResponse<Post>> {
    return this.request<Post>(`/posts/${postId}`);
  }

  async createPost(options: CreatePostOptions): Promise<ApiResponse<Post>> {
    const stats = this.getUsageStats();
    if (!stats.canPost) {
      return {
        success: false,
        error: `Rate limited. Next post available at ${stats.nextPostAvailable?.toISOString()}`,
      };
    }

    const result = await this.request<Post>('/posts', {
      method: 'POST',
      body: JSON.stringify(options),
    });

    if (result.success) {
      this.rateLimits.lastPostTime = new Date();
    }

    return result;
  }

  async createComment(options: CreateCommentOptions): Promise<ApiResponse<Comment>> {
    const stats = this.getUsageStats();
    if (!stats.canComment) {
      return {
        success: false,
        error: `Rate limited. Next comment available at ${stats.nextCommentAvailable?.toISOString()}`,
      };
    }

    const result = await this.request<Comment>(`/posts/${options.postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: options.body,
        parent_id: options.parentId,
      }),
    });

    if (result.success) {
      this.rateLimits.lastCommentTime = new Date();
      this.rateLimits.commentsToday++;
    }

    return result;
  }

  async upvote(postId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/posts/${postId}/upvote`, { method: 'POST' });
  }

  async downvote(postId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/posts/${postId}/downvote`, { method: 'POST' });
  }

  async getComments(postId: string, sort?: 'top' | 'new' | 'controversial'): Promise<ApiResponse<Comment[]>> {
    const query = sort ? `?sort=${sort}` : '';
    return this.request<Comment[]>(`/posts/${postId}/comments${query}`);
  }

  getUsageStats(): UsageStats {
    this.maybeResetDailyCounters();

    const now = new Date();
    const canPost = !this.rateLimits.lastPostTime ||
      (now.getTime() - this.rateLimits.lastPostTime.getTime()) >= 30 * 60 * 1000;
    const canComment = !this.rateLimits.lastCommentTime ||
      (now.getTime() - this.rateLimits.lastCommentTime.getTime()) >= 20 * 1000;

    return {
      postsToday: 0,
      commentsToday: this.rateLimits.commentsToday,
      votesToday: 0,
      canPost,
      canComment: canComment && this.rateLimits.commentsToday < 50,
      nextPostAvailable: canPost ? undefined :
        new Date(this.rateLimits.lastPostTime!.getTime() + 30 * 60 * 1000),
      nextCommentAvailable: canComment ? undefined :
        new Date(this.rateLimits.lastCommentTime!.getTime() + 20 * 1000),
    };
  }

  private maybeResetDailyCounters() {
    const today = new Date().toDateString();
    if (this.rateLimits.lastResetDate !== today) {
      this.rateLimits.commentsToday = 0;
      this.rateLimits.lastResetDate = today;
    }
  }
}
