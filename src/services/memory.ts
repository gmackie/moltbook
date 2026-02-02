import Database from 'better-sqlite3';
import type {
  ConversationMemory,
  ContentMemory,
  RelationshipMemory,
  MemoryStats
} from '../types/memory.js';

export class MemoryService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        post_title TEXT NOT NULL,
        submolt TEXT,
        status TEXT DEFAULT 'open',
        last_interaction TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content_id TEXT NOT NULL,
        title TEXT,
        body TEXT NOT NULL,
        submolt TEXT,
        upvotes INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relationships (
        agent_name TEXT PRIMARY KEY,
        interaction_count INTEGER DEFAULT 0,
        last_interaction TEXT NOT NULL,
        sentiment REAL DEFAULT 0,
        category TEXT DEFAULT 'unknown',
        topics TEXT DEFAULT '[]',
        notes TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_post ON conversations(post_id);
      CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
      CREATE INDEX IF NOT EXISTS idx_relationships_category ON relationships(category);
    `);
  }

  addConversation(data: {
    postId: string;
    postTitle: string;
    submolt?: string;
  }): ConversationMemory {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO conversations (id, post_id, post_title, submolt, last_interaction, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.postId, data.postTitle, data.submolt ?? null, now, now);

    return {
      id,
      postId: data.postId,
      postTitle: data.postTitle,
      submolt: data.submolt ?? '',
      status: 'open',
      lastInteraction: new Date(now),
      createdAt: new Date(now),
    };
  }

  getConversations(status?: 'open' | 'concluded'): ConversationMemory[] {
    const query = status
      ? 'SELECT * FROM conversations WHERE status = ? ORDER BY last_interaction DESC'
      : 'SELECT * FROM conversations ORDER BY last_interaction DESC';

    const rows = status
      ? this.db.prepare(query).all(status) as any[]
      : this.db.prepare(query).all() as any[];

    return rows.map(row => ({
      id: row.id,
      postId: row.post_id,
      postTitle: row.post_title,
      submolt: row.submolt ?? '',
      status: row.status,
      lastInteraction: new Date(row.last_interaction),
      createdAt: new Date(row.created_at),
    }));
  }

  addContent(data: {
    type: 'post' | 'comment';
    contentId: string;
    title?: string;
    body: string;
    submolt?: string;
    upvotes?: number;
  }): ContentMemory {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO content (id, type, content_id, title, body, submolt, upvotes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.type, data.contentId, data.title ?? null, data.body, data.submolt ?? null, data.upvotes ?? 0, now);

    return {
      id,
      type: data.type,
      contentId: data.contentId,
      title: data.title,
      body: data.body,
      submolt: data.submolt,
      upvotes: data.upvotes ?? 0,
      createdAt: new Date(now),
    };
  }

  getContent(type?: 'post' | 'comment'): ContentMemory[] {
    const query = type
      ? 'SELECT * FROM content WHERE type = ? ORDER BY created_at DESC'
      : 'SELECT * FROM content ORDER BY created_at DESC';

    const rows = type
      ? this.db.prepare(query).all(type) as any[]
      : this.db.prepare(query).all() as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      contentId: row.content_id,
      title: row.title,
      body: row.body,
      submolt: row.submolt,
      upvotes: row.upvotes,
      createdAt: new Date(row.created_at),
    }));
  }

  recordInteraction(agentName: string, data: {
    sentiment?: number;
    topics?: string[];
    note?: string;
  }): RelationshipMemory {
    const now = new Date().toISOString();
    const existing = this.getRelationship(agentName);

    if (existing) {
      const newTopics = [...new Set([...existing.topics, ...(data.topics ?? [])])];
      const newNotes = data.note ? [...existing.notes, data.note] : existing.notes;
      const newSentiment = data.sentiment !== undefined
        ? (existing.sentiment + data.sentiment) / 2
        : existing.sentiment;

      this.db.prepare(`
        UPDATE relationships
        SET interaction_count = interaction_count + 1,
            last_interaction = ?,
            sentiment = ?,
            topics = ?,
            notes = ?,
            updated_at = ?
        WHERE agent_name = ?
      `).run(now, newSentiment, JSON.stringify(newTopics), JSON.stringify(newNotes), now, agentName);

      return this.getRelationship(agentName)!;
    }

    this.db.prepare(`
      INSERT INTO relationships (agent_name, interaction_count, last_interaction, sentiment, topics, notes, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      agentName,
      now,
      data.sentiment ?? 0,
      JSON.stringify(data.topics ?? []),
      JSON.stringify(data.note ? [data.note] : []),
      now,
      now
    );

    return this.getRelationship(agentName)!;
  }

  getRelationship(agentName: string): RelationshipMemory | null {
    const row = this.db.prepare('SELECT * FROM relationships WHERE agent_name = ?').get(agentName) as any;
    if (!row) return null;

    return {
      agentName: row.agent_name,
      interactionCount: row.interaction_count,
      lastInteraction: new Date(row.last_interaction),
      sentiment: row.sentiment,
      category: row.category,
      topics: JSON.parse(row.topics),
      notes: JSON.parse(row.notes),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  getStats(): MemoryStats {
    const convCount = (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any).count;
    const contentCount = (this.db.prepare('SELECT COUNT(*) as count FROM content').get() as any).count;
    const relCount = (this.db.prepare('SELECT COUNT(*) as count FROM relationships').get() as any).count;

    const oldest = this.db.prepare(`
      SELECT MIN(created_at) as oldest FROM (
        SELECT created_at FROM conversations
        UNION ALL SELECT created_at FROM content
        UNION ALL SELECT created_at FROM relationships
      )
    `).get() as any;

    const newest = this.db.prepare(`
      SELECT MAX(created_at) as newest FROM (
        SELECT created_at FROM conversations
        UNION ALL SELECT created_at FROM content
        UNION ALL SELECT created_at FROM relationships
      )
    `).get() as any;

    return {
      conversationCount: convCount,
      contentCount: contentCount,
      relationshipCount: relCount,
      oldestEntry: oldest.oldest ? new Date(oldest.oldest) : null,
      newestEntry: newest.newest ? new Date(newest.newest) : null,
    };
  }

  close() {
    this.db.close();
  }
}
