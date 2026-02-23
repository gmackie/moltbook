export interface PluginApi {
  logger: Logger;
  config: PluginConfig;
  registerService(service: Service): void;
  registerGatewayMethod(name: string, handler: RpcHandler): void;
  registerTool(tool: Tool): void;
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

export interface PluginConfig {
  apiKey: string;
  enabled: boolean;
}

export interface Service {
  id: string;
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
}

export interface RpcHandler {
  (ctx: { respond: (success: boolean, data: unknown) => void }): void | Promise<void>;
}

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details?: unknown;
};

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  // OpenClaw plugin tools must implement execute().
  execute(toolCallId: string, params: unknown): Promise<ToolResult>;
}
