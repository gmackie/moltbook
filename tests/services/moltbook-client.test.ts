import { describe, it, expect } from 'vitest';
import { MoltbookClient } from '../../src/services/moltbook-client.js';

describe('MoltbookClient', () => {
  it('should create client with config', () => {
    const client = new MoltbookClient({ apiKey: 'test-key' });
    expect(client).toBeDefined();
    expect(client.getUsageStats()).toBeDefined();
  });

  it('should use default base URL', () => {
    const client = new MoltbookClient({ apiKey: 'test-key' });
    expect(client.baseUrl).toBe('https://www.moltbook.com/api/v1');
  });

  it('should allow custom base URL', () => {
    const client = new MoltbookClient({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:3000/api/v1'
    });
    expect(client.baseUrl).toBe('http://localhost:3000/api/v1');
  });
});
