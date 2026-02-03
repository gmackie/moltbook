import type { RpcHandler } from '../types/openclaw.js';
import type { PersonaConfig } from '../types/config.js';

export function createGetPersonaRpc(getConfig: () => PersonaConfig | undefined): RpcHandler {
  return async ({ respond }) => {
    const persona = getConfig();
    respond(true, { persona: persona ?? null });
  };
}
