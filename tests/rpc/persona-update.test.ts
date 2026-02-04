import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUpdatePersonaRpc } from '../../src/rpc/persona-update.js';
import { SettingsService } from '../../src/services/settings.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { PersonaConfig } from '../../src/types/config.js';

describe('updatePersonaRpc', () => {
  const testDir = join(process.cwd(), 'test-data-persona-rpc');
  let settings: SettingsService;
  const basePersona: PersonaConfig = {
    voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
    content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
    social: { warmth: 50, agreeableness: 50, initiative: 50 },
    identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
  };

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    settings = new SettingsService(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should update persona and return merged result', async () => {
    const handler = createUpdatePersonaRpc(settings, () => basePersona);

    let response: { success: boolean; data: unknown } | null = null;
    await handler({
      params: { persona: { voice: { formality: 75 } } },
      respond: (success, data) => { response = { success, data }; },
    } as any);

    expect(response?.success).toBe(true);
    const data = response?.data as { persona: PersonaConfig };
    expect(data.persona.voice.formality).toBe(75);
    expect(data.persona.voice.humor).toBe(50);
  });
});
