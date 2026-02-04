import type { RpcHandler } from '../types/openclaw.js';
import type { PersonaConfig } from '../types/config.js';
import type { SettingsService } from '../services/settings.js';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface UpdatePersonaParams {
  persona: DeepPartial<PersonaConfig>;
}

interface RpcContext {
  params?: UpdatePersonaParams;
  respond: (success: boolean, data: unknown) => void;
}

export function createUpdatePersonaRpc(
  settings: SettingsService,
  getBasePersona: () => PersonaConfig | undefined
): RpcHandler {
  return async (ctx) => {
    const { params, respond } = ctx as unknown as RpcContext;

    if (!params?.persona) {
      respond(false, { error: 'Missing persona parameter' });
      return;
    }

    const basePersona = getBasePersona();
    if (!basePersona) {
      respond(false, { error: 'No base persona configured' });
      return;
    }

    settings.updatePersona(params.persona);
    const updatedPersona = settings.getPersona(basePersona);

    respond(true, { persona: updatedPersona });
  };
}
