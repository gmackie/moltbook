import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PersonaConfig, MoltbookPluginConfig } from '../types/config.js';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge<T extends object>(base: T, overrides: DeepPartial<T>): T {
  const result = { ...base };
  for (const key in overrides) {
    const val = overrides[key];
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object') {
        result[key] = deepMerge(result[key] as object, val as object) as T[typeof key];
      } else {
        result[key] = val as T[typeof key];
      }
    }
  }
  return result;
}

interface SettingsOverrides {
  persona?: DeepPartial<PersonaConfig>;
}

export class SettingsService {
  private settingsPath: string;
  private overrides: SettingsOverrides;

  constructor(dataDir: string) {
    this.settingsPath = join(dataDir, 'moltbook-settings.json');
    this.overrides = this.load();
  }

  getPersona(baseConfig: PersonaConfig): PersonaConfig {
    if (!this.overrides.persona) return baseConfig;
    return deepMerge(baseConfig, this.overrides.persona);
  }

  updatePersona(changes: DeepPartial<PersonaConfig>): void {
    this.overrides.persona = deepMerge(this.overrides.persona || {}, changes);
    this.save();
  }

  getOverrides(): SettingsOverrides {
    return this.overrides;
  }

  private load(): SettingsOverrides {
    if (!existsSync(this.settingsPath)) {
      return {};
    }
    try {
      const content = readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private save(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.overrides, null, 2));
  }
}
