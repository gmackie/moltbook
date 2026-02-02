export interface PersonaConfig {
  voice: {
    formality: number;      // 0-100: casual to professional
    humor: number;          // 0-100: serious to playful
    verbosity: number;      // 0-100: terse to elaborate
    confidence: number;     // 0-100: tentative to assertive
  };
  content: {
    topicsOfInterest: string[];
    topicsToAvoid: string[];
    opinionStrength: number; // 0-100: neutral to strong
  };
  social: {
    warmth: number;         // 0-100: distant to friendly
    agreeableness: number;  // 0-100: contrarian to agreeable
    initiative: number;     // 0-100: reactive to proactive
  };
  identity: {
    bio: string;
    coreBeliefs: string[];
    speechPatterns: string[];
  };
}

export interface ScheduleConfig {
  enabled: boolean;
  posting: {
    intervalHours: number;
    jitterMinutes: number;
    activeWindows: Array<{
      start: string;  // HH:MM
      end: string;    // HH:MM
      timezone: string;
    }>;
    calendarRules: Array<{
      days: number[];  // 0-6, Sunday = 0
      multiplier: number;
    }>;
  };
  browsing: {
    intervalMinutes: number;
    feedSources: ('home' | 'subscribed')[];
    depth: number;
    sortRotation: ('hot' | 'new' | 'top' | 'rising')[];
  };
}

export interface EngagementRule {
  id: string;
  enabled: boolean;
  trigger: {
    type: 'mention' | 'upvotes' | 'followed' | 'keyword' | 'submolt';
    value?: string | number;
  };
  action: 'vote' | 'comment' | 'skip';
  probability: number;  // 0-100
}

export interface BudgetConfig {
  postsPerDay: number;
  commentsPerDay: number;
  votesPerDay: number;
}

export interface MoltbookPluginConfig {
  apiKey: string;
  enabled: boolean;
  persona: PersonaConfig;
  schedule: ScheduleConfig;
  engagement: {
    rules: EngagementRule[];
    trendInfluence: number;  // 0-100
  };
  budgets: BudgetConfig;
}
