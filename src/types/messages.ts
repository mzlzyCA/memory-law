import { z } from "zod";

export type UUID = string;

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ContentBlockParam = Record<string, unknown>;

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export type MessageOrigin = string;

export type PartialCompactDirection = "forward" | "backward";

export type MessageType = "user" | "tool_use" | "tool_result" | "ui_message";

export type PromptMessageType = "systemprompt" | "user_prompt";

export type UiMessageType = "pop_up_message" | "cli_message";

export interface BaseMessage {
  uuid: UUID;
  type: MessageType;
  message: {
    role: MessageRole;
    content: string | ContentBlockParam[];
  };
  timestamp: string;
}

// export interface PromptMessage extends BaseMessage {
//   type: "message";
//   message: {
//     role: "user" | "assistant" | "system";
//     content: string | ContentBlockParam[];
//   };
//   message_type: PromptMessageType;
// }

// User message shape aligned with the createUserMessage-derived protocol.
export interface UserMessage extends BaseMessage {
  type: "user";
  message: {
    role: "user";
    content: string | ContentBlockParam[];
  };

  // Identity discriminator fields.
  // isMeta?: true;
  // isVisibleInTranscriptOnly?: true;
  // isVirtual?: true;
  // isCompactSummary?: true;

  // Tool-result related fields.
  toolUseResult?: unknown;
  // mcpMeta?: {
  //   _meta?: Record<string, unknown>;
  //   structuredContent?: Record<string, unknown>;
  // };
  sourceToolAssistantUUID?: UUID;

  // Additional metadata fields.
  // imagePasteIds?: number[];
  // permissionMode?: PermissionMode;
  origin?: MessageOrigin;
  summarizeMetadata?: {
    messagesSummarized: number;
    userContext?: string;
    direction?: PartialCompactDirection;
  };
}

export interface ToolUseMessage extends BaseMessage {
  type: "tool_use";
  message: {
    role: "assistant";
    content: string | ContentBlockParam[];
  };
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
  message: {
    role: "tool";
    content: string | ContentBlockParam[];
  };
  toolName: string;
  toolCallId: string;
  output: Record<string, unknown>;
  schema?: ToolResultSchema;
}

export interface UiPopUpMessage extends BaseMessage {
  type: "ui_message";
  message: {
    role: "assistant" | "system";
    content: string | ContentBlockParam[];
  };
  uiType: "pop_up_message";
  title: string;
  summary?: string;
}

export interface UiCliMessage extends BaseMessage {
  type: "ui_message";
  message: {
    role: "assistant" | "system";
    content: string | ContentBlockParam[];
  };
  uiType: "cli_message";
  blocks?: Array<Record<string, unknown>>; // Reserved for pi-core-like special rendering.
}

export type UiMessage = UiPopUpMessage | UiCliMessage;

export type AgentMessage = UserMessage | PromptMessage | ToolUseMessage | ToolResultMessage | UiMessage;

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

export function validateToolResult(
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
