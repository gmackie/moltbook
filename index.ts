import type { PluginApi } from './src/types/openclaw.js';

export default function register(api: PluginApi) {
  api.logger.info('Moltbook plugin loaded');
}
