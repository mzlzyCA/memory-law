import { randomUUID } from "node:crypto";

import { createProvider, parseProviderAndModel } from "./models";
import { Defaultcompact } from "./services/compact/defaultCompact";
import { createInitialGlobalState } from "./storage/globalState";
import { runArrangedTools, type ArrangedToolCall } from "./tools/runArrangedTools";
import type {
  AgentMessage,
  UserMessage as AgentUserMessage,
  UICliMessage,
  ToolUseMessage,
  UserMessage,
} from "./types/messages";
import type {
  AssistantMessage as ParentAssistantMessage,
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
  initialUserMessage?: AgentMessage[];
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

function isValidTool(candidate: unknown): candidate is Tool {
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

function buildToolRegistry(rawTools: unknown[]): Tools {
  return rawTools.reduce<Tools>((acc, candidate) => {
    if (!isValidTool(candidate)) {
      return acc;
    }
    if (typeof candidate.isEnabled === "function" && !candidate.isEnabled()) {
      return acc;
    }
    acc[candidate.name] = candidate;
    return acc;
  }, {});
}

function createToolUseContext(args: {
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
    }
  };
}

function resolveQueryState(params: QueryParams, tools: Tools, abortController: AbortController): QueryState {
  const existing = params.state;
  if (existing) {
    existing.toolUseContext.options.tools = tools;
    existing.toolUseContext.abortController = abortController;
    return existing;
  }

  const initialMessages =
    params.initialUserMessage && params.initialUserMessage.length > 0
      ? params.initialUserMessage
      : [makeUserMessage(params.prompt)];

  const toolUseContext = createToolUseContext({ abortController, tools });
  return {
    compacted: false,
    turnCounter: Math.max(0, params.iteration - 1),
    turnId: randomUUID(),
    messages: initialMessages,
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

function applyRuntimeSkills(_context: ToolUseContext): void {
  // TODO: inject runtime skills into toolUseContext before model call.
}

function sanitizeToolMessages(messages: AgentMessage[]): AgentMessage[] {
  // Clear tool results output and content to avoid token overload and potential PII leakage, while keeping the message structure for compacting and summarization to work effectively.
  return messages.map((message) => {
    if (message.type !== "user" || !message.tool_result) {
      return message;
    }

    const sanitized: AgentUserMessage = {
      ...message,
      tool_result: {
        ...message.tool_result,
        output: {},
      },
      message: {
        ...message.message,
        content: "",
      },
    };

    return sanitized;
  });
}

function attachToolContext(messages: AgentMessage[], _context: ToolUseContext): AgentMessage[] {
  // Tool ask/reply should stay in user/assistant/tool messages, not UI-only cli messages.
  return messages;
}

function buildPromptText(messages: AgentMessage[], fallbackPrompt: string): string {
  if (messages.length === 0) {
    return fallbackPrompt;
  }

  return messages
    .map((message) => {
      if (message.type === "user" && message.tool_result) {
        return `[tool_result|user] tool=${message.tool_result.toolName} toolCallId=${message.tool_result.toolCallId} output=${JSON.stringify(message.tool_result.output)}`;
      }

      const content = (() => {
        if (typeof message.message.content === "string") {
          return message.message.content;
        }
        return JSON.stringify(message.message.content);
      })();

      if (message.type === "tool_use") {
        return `[tool_use|${message.message.role}] tool=${message.toolName} toolCallId=${message.toolCallId} input=${JSON.stringify(message.input)}`;
      }

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

  const envelope = parsed as Record<string, unknown>;
  const rawToolCalls = Array.isArray(envelope.tool_calls) ? envelope.tool_calls : [];
  const toolCalls: ParsedModelReply["toolCalls"] = [];

  for (const item of rawToolCalls) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const call = item as Record<string, unknown>;
    const toolNameValue = call.toolName ?? call.tool;
    if (typeof toolNameValue !== "string" || toolNameValue.length === 0) {
      continue;
    }

    const input =
      call.input && typeof call.input === "object" && !Array.isArray(call.input)
        ? (call.input as Record<string, unknown>)
        : {};
    const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : randomUUID();
    toolCalls.push({
      toolName: toolNameValue,
      input,
      toolCallId,
    });
  }

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
  parentMessage: ParentAssistantMessage;
} {
  const assistantMessage: UICliMessage = {
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

  const arrangedCalls: ArrangedToolCall[] = [];
  for (const call of args.parsed.toolCalls) {
    const tool = args.state.toolUseContext.options.tools[call.toolName];
    if (!tool) {
      continue;
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

    arrangedCalls.push({
      tool,
      input: call.input,
      toolCallId: call.toolCallId,
    });
  }

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

function recordToolResult(args: {
  state: QueryState;
  call: ArrangedToolCall;
  index: number;
  result: ToolResult<unknown>;
}): void {
  const toolError = "error" in args.result ? args.result.error : "";
  const toolResultMessage: AgentUserMessage = {
    uuid: randomUUID(),
    type: "user",
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: args.result.ok
        ? `Tool ${args.call.tool.name} succeeded.`
        : `Tool ${args.call.tool.name} failed: ${toolError}`,
    },
    toolUseResult: args.result.ok
      ? { ok: true, data: args.result.output }
      : { ok: false, error: toolError, data: args.result.output ?? null },
    tool_result: {
      marker: "tool_result",
      toolName: args.call.tool.name,
      toolCallId: args.call.toolCallId,
      output: args.result.ok
        ? { ok: true, data: args.result.output }
        : { ok: false, error: toolError, data: args.result.output ?? null },
    },
  };

  args.state.messages.push(toolResultMessage);
}

function buildTurnSummary(args: {
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
        const resultError = "error" in result ? result.error : "unknown_error";
        return `${call.tool.name}:error(${resultError})`;
      }
      return `${call.tool.name}:ok`;
    })
    .join("; ");

  const summaryMessage: UICliMessage = {
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
  const tools = buildToolRegistry(params.tools);
  const stateRef = resolveQueryState(params, tools, abortController);

  stateRef.toolUseContext.messages = stateRef.messages;

  const outputs: string[] = [];
  const toolUseSummary: string[] = [];

  while (stateRef.turnCounter < params.maxIterations) {
    throwIfAborted(abortController);

    stateRef.turnCounter += 1;
    stateRef.turncount = true;
    stateRef.turnId = randomUUID();

    applyRuntimeSkills(stateRef.toolUseContext);

    const messagesFromQuery = params.state?.messages ?? stateRef.messages;
    const sanitized = sanitizeToolMessages(messagesFromQuery);
    const compacted = Defaultcompact({
      messages: sanitized,
      contextWindow: adapter.getContextWindow(model),
    });
    stateRef.messages = compacted;
    stateRef.toolUseContext.messages = stateRef.messages;
    stateRef.compacted = compacted.length < sanitized.length;

    const modelMessages = attachToolContext(
      compacted,
      stateRef.toolUseContext,
    );

    const response = await adapter.callModel({
      model,
      prompt: buildPromptText(modelMessages, params.prompt),
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
        recordToolResult({
          state: stateRef,
          call,
          index,
          result,
        });
      },
    });

    throwIfAborted(abortController);

    const summary = buildTurnSummary({
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
