import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsService } from '../../src/services/settings.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SettingsService', () => {
  const testDir = join(process.cwd(), 'test-data-settings');
  let settings: SettingsService;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    settings = new SettingsService(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should return base persona when no overrides exist', () => {
    const basePersona = {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
    };

    const result = settings.getPersona(basePersona);
    expect(result).toEqual(basePersona);
  });

  it('should merge overrides with base persona', () => {
    const basePersona = {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
    };

    settings.updatePersona({ voice: { formality: 75, humor: 50, verbosity: 50, confidence: 50 } });
    const result = settings.getPersona(basePersona);

    expect(result.voice.formality).toBe(75);
    expect(result.voice.humor).toBe(50);
  });

  it('should persist overrides across instances', () => {
    const basePersona = {
      voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
      content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
      social: { warmth: 50, agreeableness: 50, initiative: 50 },
      identity: { bio: '', coreBeliefs: [], speechPatterns: [] },
    };

    settings.updatePersona({ voice: { formality: 80, humor: 50, verbosity: 50, confidence: 50 } });

    const settings2 = new SettingsService(testDir);
    const result = settings2.getPersona(basePersona);

    expect(result.voice.formality).toBe(80);
  });
});
