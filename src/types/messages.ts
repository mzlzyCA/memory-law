import { z } from "zod";
import type { ToolOutput } from "./tool";
export type UUID = string;

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ContentBlockParam = Record<string, unknown>;
export type MessageContent = string | ContentBlockParam[];

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export type MessageType = "assistant" | "user" | "tool_use" | "ui_message";

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
  tool_result?: {
    marker: "tool_result";
    toolName: string;
    toolCallId: string;
    output: Record<string, unknown>;
    schema?: ToolOutput;
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
  | UICliMessage;


