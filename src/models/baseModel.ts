export type BuiltinProviderName = "openai" | "claude" | "gemini" | "myprovider";

export interface ModelRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  text: string;
  raw?: unknown;
}

export interface BaseModelProvider {
  readonly name: string;
  getContextWindow(model: string): number;
  callModel(request: ModelRequest): Promise<ModelResponse>;
}

export function composeSystemPrompt(
  systemPrompt: string | undefined,
  metadata: Record<string, unknown> | undefined,
): string {
  const extras = metadata
    ? Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    : [];

  return [systemPrompt ?? "", ...extras].filter(Boolean).join("\n\n");
}
