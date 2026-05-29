import { randomUUID } from "node:crypto";

import { createProvider, parseProviderAndModel } from "./models";
import { Defaultcompact } from "./services/compact/defaultCompact";
import { createInitialGlobalState } from "./storage/globalState";
import { runArrangedTools, type ArrangedToolCall } from "./tools/runArrangedTools";
import type {
  AgentMessage,
  ToolResultMessage,
  ToolUseMessage,
  UiCliMessage,
  UserMessage,
} from "./types/messages";
import type {
  AssistantMessage,
  Tool,
  ToolResult,
  ToolUseContext,
  Tools,
} from "./types/tool";

export type CompactTrackingState = {
  compacted: boolean;
  turnCounter: number;
  // Unique ID per turn
  turnId: string;
};

export type QueryState = CompactTrackingState & {
  messages: AgentMessage[];
  toolUseContext: ToolUseContext;
  turncount: boolean;
  transitionFlag?: "continue";
};

export type state = QueryState;

export type QueryResult = {
  text: string;
  outputs: string[];
  toolUseSummary: string[];
  state: QueryState;
};

export interface QueryParams {
  model: string;
  prompt: string;
  systemPrompt: string;
  tools: unknown[];
  description: string;
  workspacePath: string;
  iteration: number;
  maxIterations: number;
  state?: QueryState;
  abortController?: AbortController;
}

type ParsedModelReply = {
  assistantText: string;
  toolCalls: Array<{
    toolName: string;
    input: Record<string, unknown>;
    toolCallId: string;
  }>;
};

type ModelReplyEnvelope = {
  assistant?: string;
  tool_calls?: Array<{
    tool?: string;
    toolName?: string;
    toolCallId?: string;
    input?: Record<string, unknown>;
  }>;
};

function isTool(candidate: unknown): candidate is Tool {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const value = candidate as Partial<Tool>;
  return (
    typeof value.name === "string" &&
    typeof value.call === "function" &&
    typeof value.description === "function" &&
    typeof value.isEnabled === "function"
  );
}

function toToolRegistry(rawTools: unknown[]): Tools {
  return rawTools.reduce<Tools>((acc, candidate) => {
    if (!isTool(candidate)) {
      return acc;
    }
    if (!candidate.isEnabled()) {
      return acc;
    }
    acc[candidate.name] = candidate;
    return acc;
  }, {});
}

function createDefaultToolUseContext(args: {
  abortController: AbortController;
  tools: Tools;
}): ToolUseContext {
  return {
    options: {
      debug: false,
      tools: args.tools,
      verbose: false,
      isNonInteractiveSession: false,
    },
    abortController: args.abortController,
    readFileState: new Map<string, unknown>(),
    getAppState: () => createInitialGlobalState(),
    setAppState: () => {
      // no-op default for CLI workflow
    },
    messages: [],
  };
}

function makeUserMessage(content: string): UserMessage {
  return {
    uuid: randomUUID(),
    type: "user",
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content,
    },
    origin: "query",
  };
}

function ensureState(params: QueryParams, tools: Tools, abortController: AbortController): QueryState {
  const existing = params.state;
  if (existing) {
    existing.toolUseContext.options.tools = tools;
    existing.toolUseContext.abortController = abortController;
    return existing;
  }

  const toolUseContext = createDefaultToolUseContext({ abortController, tools });
  return {
    compacted: false,
    turnCounter: Math.max(0, params.iteration - 1),
    turnId: randomUUID(),
    messages: [makeUserMessage(params.prompt)],
    toolUseContext,
    turncount: false,
    transitionFlag: undefined,
  };
}

function throwIfAborted(controller?: AbortController): void {
  if (controller?.signal.aborted) {
    throw new Error("Query aborted by user.");
  }
}

function injectSkills(_context: ToolUseContext): void {
  // TODO: inject runtime skills into toolUseContext before model call.
}

function sanitizeToolResultMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.type !== "tool_result") {
      return message;
    }

    const sanitized: ToolResultMessage = {
      ...message,
      output: {},
      message: {
        ...message.message,
        content: "",
      },
    };

    return sanitized;
  });
}

function injectToolUseContextIntoMessages(messages: AgentMessage[], context: ToolUseContext): AgentMessage[] {
  const toolNames = Object.keys(context.options.tools);
  const hintMessage: UiCliMessage = {
    uuid: randomUUID(),
    type: "ui_message",
    timestamp: new Date().toISOString(),
    uiType: "cli_message",
    message: {
      role: "system",
      content: `Tool context: ${toolNames.join(", ") || "none"}. nonInteractive=${String(
        context.options.isNonInteractiveSession,
      )}`,
    },
    blocks: [],
  };

  // TODO: inject context by message category (user/tool_use/tool_result/ui_message).
  return [...messages, hintMessage];
}

function toPrompt(messages: AgentMessage[], fallbackPrompt: string): string {
  if (messages.length === 0) {
    return fallbackPrompt;
  }

  return messages
    .map((message) => {
      const content =
        typeof message.message.content === "string"
          ? message.message.content
          : JSON.stringify(message.message.content);
      return `[${message.type}|${message.message.role}] ${content}`;
    })
    .join("\n");
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseModelReply(rawText: string): ParsedModelReply {
  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/i);
  const jsonCandidate = fencedMatch?.[1]?.trim() ?? rawText.trim();
  const parsed = safeParseJson(jsonCandidate);

  if (!parsed || typeof parsed !== "object") {
    return {
      assistantText: rawText,
      toolCalls: [],
    };
  }

  const envelope = parsed as ModelReplyEnvelope;
  const toolCalls = (envelope.tool_calls ?? [])
    .map((call) => {
      const toolName = call.toolName ?? call.tool;
      if (!toolName || typeof toolName !== "string") {
        return null;
      }
      return {
        toolName,
        input: call.input ?? {},
        toolCallId: call.toolCallId ?? randomUUID(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    assistantText:
      typeof envelope.assistant === "string" && envelope.assistant.length > 0
        ? envelope.assistant
        : rawText,
    toolCalls,
  };
}

function postProcessModelReply(args: {
  parsed: ParsedModelReply;
  state: QueryState;
}): {
  assistantMessage: AgentMessage;
  arrangedCalls: ArrangedToolCall[];
  parentMessage: AssistantMessage;
} {
  const assistantMessage: AgentMessage = {
    uuid: randomUUID(),
    type: "ui_message",
    timestamp: new Date().toISOString(),
    uiType: "cli_message",
    message: {
      role: "assistant",
      content: args.parsed.assistantText,
    },
    blocks: [],
  };

  args.state.messages.push(assistantMessage);

  const arrangedCalls = args.parsed.toolCalls
    .map((call) => {
      const tool = args.state.toolUseContext.options.tools[call.toolName];
      if (!tool) {
        return null;
      }

      const toolUseMessage: ToolUseMessage = {
        uuid: randomUUID(),
        type: "tool_use",
        timestamp: new Date().toISOString(),
        toolName: call.toolName,
        toolCallId: call.toolCallId,
        input: call.input,
        message: {
          role: "assistant",
          content: `Tool call requested: ${call.toolName}`,
        },
      };
      args.state.messages.push(toolUseMessage);

      return {
        tool,
        input: call.input,
      };
    })
    .filter((item): item is ArrangedToolCall => item !== null);

  // TODO: refine insertion targets by message subtype instead of append-only behavior.
  return {
    assistantMessage,
    arrangedCalls,
    parentMessage: {
      id: assistantMessage.uuid,
      role: "assistant",
      content: args.parsed.assistantText,
      createdAt: assistantMessage.timestamp,
    },
  };
}

function appendToolResultMessage(args: {
  state: QueryState;
  call: ArrangedToolCall;
  index: number;
  result: ToolResult<unknown>;
}): void {
  const toolResultMessage: ToolResultMessage = {
    uuid: randomUUID(),
    type: "tool_result",
    timestamp: new Date().toISOString(),
    toolName: args.call.tool.name,
    toolCallId: `${args.call.tool.name}-${args.state.turnId}-${args.index}`,
    output: args.result.ok
      ? { ok: true, data: args.result.output }
      : { ok: false, error: args.result.error, data: args.result.output ?? null },
    message: {
      role: "tool",
      content: args.result.ok
        ? `Tool ${args.call.tool.name} succeeded.`
        : `Tool ${args.call.tool.name} failed: ${args.result.error}`,
    },
  };

  args.state.messages.push(toolResultMessage);
}

function summarizeToolUseTurn(args: {
  state: QueryState;
  calls: ArrangedToolCall[];
  results: ToolResult<unknown>[];
}): string {
  const summary = args.calls
    .map((call, index) => {
      const result = args.results[index];
      if (!result) {
        return `${call.tool.name}:missing_result`;
      }
      if (!result.ok) {
        return `${call.tool.name}:error(${result.error})`;
      }
      return `${call.tool.name}:ok`;
    })
    .join("; ");

  const summaryMessage: UiCliMessage = {
    uuid: randomUUID(),
    type: "ui_message",
    timestamp: new Date().toISOString(),
    uiType: "cli_message",
    message: {
      role: "assistant",
      content: `Tool summary(turn ${args.state.turnCounter}): ${summary || "no tool call"}`,
    },
    blocks: [],
  };
  args.state.messages.push(summaryMessage);

  return summary;
}

export async function query(params: QueryParams): Promise<QueryResult> {
  const { provider, model } = parseProviderAndModel(params.model);
  const adapter = createProvider(provider);
  const abortController = params.abortController ?? new AbortController();
  const tools = toToolRegistry(params.tools);
  const stateRef = ensureState(params, tools, abortController);

  stateRef.toolUseContext.messages = stateRef.messages;

  const outputs: string[] = [];
  const toolUseSummary: string[] = [];

  while (stateRef.turnCounter < params.maxIterations) {
    throwIfAborted(abortController);

    stateRef.turnCounter += 1;
    stateRef.turncount = true;
    stateRef.turnId = randomUUID();

    injectSkills(stateRef.toolUseContext);

    const sanitized = sanitizeToolResultMessages(stateRef.messages);
    const compacted = Defaultcompact({ messages: sanitized });
    stateRef.compacted = compacted.length < sanitized.length;

    const modelMessages = injectToolUseContextIntoMessages(
      compacted,
      stateRef.toolUseContext,
    );

    const response = await adapter.callModel({
      model,
      prompt: toPrompt(modelMessages, params.prompt),
      systemPrompt: [
        params.systemPrompt,
        `Description: ${params.description}`,
        `Workspace: ${params.workspacePath}`,
        `Iteration: ${stateRef.turnCounter}/${params.maxIterations}`,
        `Tools: ${JSON.stringify(Object.keys(tools))}`,
      ].join("\n\n"),
    });

    throwIfAborted(abortController);

    const parsed = parseModelReply(response.text);
    const { arrangedCalls, parentMessage } = postProcessModelReply({
      parsed,
      state: stateRef,
    });

    outputs.push(parsed.assistantText);

    if (arrangedCalls.length === 0) {
      stateRef.transitionFlag = undefined;
      break;
    }

    const toolResults = await runArrangedTools({
      calls: arrangedCalls,
      context: stateRef.toolUseContext,
      canUseTool: async (toolName: string) => Boolean(tools[toolName]),
      parentMessage,
      onEachResult: async (toolResultArgs) => {
        const { call, result, index } = toolResultArgs;
        appendToolResultMessage({
          state: stateRef,
          call,
          index,
          result,
        });
      },
    });

    throwIfAborted(abortController);

    const summary = summarizeToolUseTurn({
      state: stateRef,
      calls: arrangedCalls,
      results: toolResults,
    });
    toolUseSummary.push(summary);

    stateRef.transitionFlag = "continue";
  }

  return {
    text: outputs.at(-1) ?? "",
    outputs,
    toolUseSummary,
    state: stateRef,
  };
}
