import type { MoltbookConfig, RateLimitState, UsageStats } from '../types/moltbook.js';

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

  getUsageStats(): UsageStats {
    this.maybeResetDailyCounters();

    const now = new Date();
    const canPost = !this.rateLimits.lastPostTime ||
      (now.getTime() - this.rateLimits.lastPostTime.getTime()) >= 30 * 60 * 1000;
    const canComment = !this.rateLimits.lastCommentTime ||
      (now.getTime() - this.rateLimits.lastCommentTime.getTime()) >= 20 * 1000;

    return {
      postsToday: 0, // TODO: track
      commentsToday: this.rateLimits.commentsToday,
      votesToday: 0, // TODO: track
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
