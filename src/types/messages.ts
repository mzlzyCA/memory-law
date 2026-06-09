import { z } from "zod";

export type UUID = string;

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ContentBlockParam = Record<string, unknown>;
export type MessageContent = string | ContentBlockParam[];

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export type MessageType = "assistant" | "user" | "tool_use" | "tool_result" | "ui_message";

export type UIMessageType = "pop_up_message" | "cli_message";

export interface BaseMessage {
  uuid: UUID;
  type: MessageType;
  message: {
    role: MessageRole;
    content: MessageContent;
  };
  timestamp: string;
}

// MVP: lightweight assistant payload shape, compatible with Beta message style.
export type BetaUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type BetaContentBlock = {
  type?: string;
  text?: string;
} & Record<string, unknown>;

export interface AssistantMessage extends BaseMessage {
  type: "assistant";
  message: {
    id: string;
    container: unknown | null;
    model: string;
    role: "assistant";
    stop_reason: string | null;
    stop_sequence: string | null;
    type: "message";
    usage: BetaUsage;
    content: BetaContentBlock[];
    context_management: unknown | null;
  };

  requestId?: string;
  apiError?: unknown;
  error?: unknown;
  errorDetails?: string;
  isApiErrorMessage?: boolean;
  isVirtual?: true;
}

// User message shape aligned with the createUserMessage-derived protocol.
export interface UserMessage extends BaseMessage {
  type: "user";
  message: {
    role: "user";
    content: MessageContent;
  };

  // Tool-result related fields.
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: UUID;

  // Additional metadata fields.
  summarizeMetadata?: {
    messagesSummarized: number;
  };
}

export interface ToolUseMessage extends BaseMessage {
  type: "tool_use";
  message: {
    role: "assistant";
    content: MessageContent;
  };
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

export interface ToolResultMessage extends BaseMessage {
  type: "tool_result";
  message: {
    role: "tool";
    content: MessageContent;
  };
  toolName: string;
  toolCallId: string;
  output: Record<string, unknown>;
  schema?: ToolResultSchema;
}

export interface UICliMessage extends BaseMessage {
  type: "ui_message";
  message: {
    role: "assistant" | "system";
    content: MessageContent;
  };
  uiType: UIMessageType;
  blocks?: ContentBlockParam[];
}

export type AgentMessage =
  | AssistantMessage
  | UserMessage
  | ToolUseMessage
  | ToolResultMessage
  | UICliMessage

export const toolResultSchema = z.object({
  requiredKeys: z.array(z.string()).optional(),
  keyTypes: z
    .record(
      z.string(),
      z.enum(["string", "number", "boolean", "object", "array"]),
    )
    .optional(),
});
export type ToolResultSchema = z.infer<typeof toolResultSchema>;

function resolveValueType(
  value: unknown,
): "string" | "number" | "boolean" | "object" | "array" | "unknown" {
 if (value === null) return "unknown";
  return (["string", "number", "boolean", "object"].includes(typeof value)
    ? (typeof value as "string" | "number" | "boolean" | "object")
    : "unknown");
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
