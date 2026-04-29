import { z } from "zod";

export type MessageType = "message" | "tool_use" | "tool_result" | "ui_message";

export type PromptMessageType = "systemprompt" | "user_prompt";

export type UiMessageType = "pop_up_message" | "cli_message";

export interface BaseMessage {
  id: string;
  type: MessageType;
  createdAt: string;
}

export interface PromptMessage extends BaseMessage {
  type: "message";
  message_type: PromptMessageType;
  content: string;
}

export interface ToolUseMessage extends BaseMessage {
  type: "tool_use";
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

export interface ToolResultSchema {
  requiredKeys?: string[];
  keyTypes?: Record<string, "string" | "number" | "boolean" | "object" | "array">;
}

export interface ToolResultMessage extends BaseMessage {
  type: "tool_result";
  toolName: string;
  toolCallId: string;
  output: Record<string, unknown>;
  schema?: ToolResultSchema;
}

export interface UiPopUpMessage extends BaseMessage {
  type: "ui_message";
  uiType: "pop_up_message";
  title: string;
  summary?: string;
  content: string;
}

export interface UiCliMessage extends BaseMessage {
  type: "ui_message";
  uiType: "cli_message";
  content: string;
  // Reserved for pi-core-like special rendering (card/rich blocks).
  blocks?: Array<Record<string, unknown>>;
}

export type UiMessage = UiPopUpMessage | UiCliMessage;

export type AgentMessage =
  | PromptMessage
  | ToolUseMessage
  | ToolResultMessage
  | UiMessage;

export const toolResultSchema = z.object({
  requiredKeys: z.array(z.string()).optional(),
  keyTypes: z.record(
    z.string(),
    z.enum(["string", "number", "boolean", "object", "array"]),
  ).optional(),
});

function resolveValueType(value: unknown): "string" | "number" | "boolean" | "object" | "array" | "unknown" {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "unknown";
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "unknown";
}

export function validateToolResult( //ToCheck
  output: Record<string, unknown>,
  schemaInput?: unknown,
): { valid: boolean; errors: string[] } {
  if (schemaInput == null) {
    return { valid: true, errors: [] };
  }

  const parsedSchema = toolResultSchema.safeParse(schemaInput);
  if (!parsedSchema.success) {
    return {
      valid: false,
      errors: parsedSchema.error.issues.map((issue) => issue.message),
    };
  }

  const schema = parsedSchema.data;
  const errors: string[] = [];

  for (const key of schema.requiredKeys ?? []) {
    if (!(key in output)) {
      errors.push(`Missing required key: ${key}`);
    }
  }

  for (const [key, expectedType] of Object.entries(schema.keyTypes ?? {})) {
    if (!(key in output)) {
      continue;
    }
    const actualType = resolveValueType(output[key]);
    if (actualType !== expectedType) {
      errors.push(
        `Type mismatch for key "${key}": expected ${expectedType}, got ${actualType}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
