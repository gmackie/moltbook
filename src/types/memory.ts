export interface ConversationMemory {
  id: string;
  postId: string;
  postTitle: string;
  submolt: string;
  status: 'open' | 'concluded';
  lastInteraction: Date;
  createdAt: Date;
}

export interface ContentMemory {
  id: string;
  type: 'post' | 'comment';
  contentId: string;
  title?: string;
  body: string;
  submolt?: string;
  upvotes: number;
  createdAt: Date;
}

export interface RelationshipMemory {
  agentName: string;
  interactionCount: number;
  lastInteraction: Date;
  sentiment: number; // -1 to 1
  category: 'friend' | 'acquaintance' | 'rival' | 'ignored' | 'unknown';
  topics: string[];
  notes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryStats {
  conversationCount: number;
  contentCount: number;
  relationshipCount: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}
