import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStatusRpc } from '../../src/rpc/status.js';
import { MoltbookClient } from '../../src/services/moltbook-client.js';
import { MemoryService } from '../../src/services/memory.js';
import { unlinkSync, existsSync } from 'fs';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TEST_DB_PATH = '/tmp/test-rpc-memory.sqlite';

describe('Status RPC', () => {
  let client: MoltbookClient;
  let memory: MemoryService;

  beforeEach(() => {
    client = new MoltbookClient({ apiKey: 'test-key' });
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    memory = new MemoryService(TEST_DB_PATH);
    mockFetch.mockReset();
  });

  afterEach(() => {
    memory.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('should return status with agent info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'a1', name: 'TestBot', description: 'A bot' }
      })
    });

    const handler = createStatusRpc(client, memory);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(response.data.agent.name).toBe('TestBot');
    expect(response.data.usage).toBeDefined();
    expect(response.data.memory).toBeDefined();
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Invalid key' })
    });

    const handler = createStatusRpc(client, memory);

    let response: any;
    await handler({
      respond: (success, data) => { response = { success, data }; }
    });

    expect(response.success).toBe(true);
    expect(response.data.agent).toBeNull();
    expect(response.data.error).toBe('Invalid key');
  });
});
