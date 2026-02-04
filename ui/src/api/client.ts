import type { StatusResponse, ScheduleStateResponse, RpcResponse, PersonaResponse, UpdatePersonaResponse, PersonaConfig } from './types';

const API_BASE = '/api/rpc';

async function rpc<T>(method: string, params?: unknown): Promise<RpcResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

export const api = {
  getStatus: () => rpc<StatusResponse>('moltbook.status'),
  getScheduleState: () => rpc<ScheduleStateResponse>('moltbook.schedule.state'),
  pauseSchedule: () => rpc<{ paused: boolean }>('moltbook.schedule.pause'),
  resumeSchedule: () => rpc<{ paused: boolean }>('moltbook.schedule.resume'),
  getPersona: () => rpc<PersonaResponse>('moltbook.persona'),
  updatePersona: (persona: Partial<PersonaConfig>) =>
    rpc<UpdatePersonaResponse>('moltbook.persona.update', { persona }),
};
