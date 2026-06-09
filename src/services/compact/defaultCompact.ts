import type { AgentMessage } from "../../types/messages";

export type DefaultCompactArgs = {
  messages: AgentMessage[];
  maxMessages?: number;
  contextWindow?: number;
  compactBufferTokens?: number;
  summaryReservedTokens?: number;
};

export const DEFAULT_MODEL_CONTEXT_WINDOW = 128_000;
export const DEFAULT_COMPACT_BUFFER_TOKENS = 13_000;
export const DEFAULT_SUMMARY_RESERVED_TOKENS = 2_048;
export const DEFAULT_COMPACT_CIRCUIT_BREAKER = 3;
export const DEFAULT_KEEP_LATEST_MESSAGES = 24;

export type TokenCountWithEstimation = (input: string) => number;

export type CompactConfig = {
  enabled?: boolean;
  contextWindow?: number;
  compactBufferTokens?: number;
  summaryReservedTokens?: number;
  circuitBreakerLimit?: number;
  keepLatestMessages?: number;
  tokenCountWithEstimation?: TokenCountWithEstimation;
};

export type CompactConversationArgs = {
  messages: AgentMessage[];
  config?: CompactConfig;
  // 调用方注入模型摘要函数，便于对接实际 provider。
  summarizeWithModel?: (args: {
    messagesToSummarize: AgentMessage[];
    tokenBudget: number;
  }) => Promise<string>;
  compactAttempt?: number;
};

export type CompactConversationResult = {
  compacted: boolean;
  messages: AgentMessage[];
  summaryMessage?: AgentMessage;
  summaryText?: string;
};

function defaultTokenCountWithEstimation(input: string): number {
  if (!input) {
    return 0;
  }
  // 粗略估算：英文约 4 字符/Token，中文与符号按更保守估计。
  return Math.ceil(input.length / 4);
}

export function tokenCountWithEstimation(input: string): number {
  return defaultTokenCountWithEstimation(input);
}

function messageToText(message: AgentMessage): string {
  const content =
    typeof message.message.content === "string"
      ? message.message.content
      : JSON.stringify(message.message.content);
  return `[${message.type}|${message.message.role}] ${content}`;
}

export function countMessagesTokens(
  messages: AgentMessage[],
  tokenCounter: TokenCountWithEstimation = tokenCountWithEstimation,
): number {
  return messages.reduce((sum, message) => sum + tokenCounter(messageToText(message)), 0);
}

export function getEffectiveContextWindow(config: CompactConfig = {}): number {
  const contextWindow = config.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;
  const summaryReservedTokens =
    config.summaryReservedTokens ?? DEFAULT_SUMMARY_RESERVED_TOKENS;
  return Math.max(0, contextWindow - summaryReservedTokens);
}

export function getCompactThreshold(config: CompactConfig = {}): number {
  const effective = getEffectiveContextWindow(config);
  const compactBufferTokens =
    config.compactBufferTokens ?? DEFAULT_COMPACT_BUFFER_TOKENS;
  return Math.max(0, effective - compactBufferTokens);
}

export function shouldCompact(
  messages: AgentMessage[],
  config: CompactConfig = {},
): boolean {
  const enabled = config.enabled ?? true;
  if (!enabled) {
    return false;
  }

  const tokenCounter =
    config.tokenCountWithEstimation ?? tokenCountWithEstimation;
  const totalTokens = countMessagesTokens(messages, tokenCounter);
  return totalTokens > getCompactThreshold(config);
}

function makeSummaryMessage(summaryText: string): AgentMessage {
 //TODO
 return null as unknown as AgentMessage;
}

async function fallbackSummary(messages: AgentMessage[], tokenBudget: number): Promise<string> {
  const merged = messages.map(messageToText).join("\n");
  const maxChars = Math.max(200, tokenBudget * 4);
  if (merged.length <= maxChars) {
    return merged;
  }
  return `${merged.slice(0, maxChars)}\n...(truncated)`;
}

export async function compactConversation({
  messages,
  config = {},
  summarizeWithModel,
  compactAttempt = 0,
}: CompactConversationArgs): Promise<CompactConversationResult> {
  if (!shouldCompact(messages, config)) {
    return {
      compacted: false,
      messages,
    };
  }

  const circuitBreakerLimit =
    config.circuitBreakerLimit ?? DEFAULT_COMPACT_CIRCUIT_BREAKER;
  if (compactAttempt >= circuitBreakerLimit) {
    return {
      compacted: false,
      messages,
    };
  }

  const keepLatestMessages =
    config.keepLatestMessages ?? DEFAULT_KEEP_LATEST_MESSAGES;
  if (messages.length <= keepLatestMessages + 1) {
    return {
      compacted: false,
      messages,
    };
  }

  const splitIndex = Math.max(1, messages.length - keepLatestMessages);
  const oldMessages = messages.slice(0, splitIndex);
  const latestMessages = messages.slice(splitIndex);
  const summaryBudget = config.summaryReservedTokens ?? DEFAULT_SUMMARY_RESERVED_TOKENS;
  const summaryText = summarizeWithModel
    ? await summarizeWithModel({
        messagesToSummarize: oldMessages,
        tokenBudget: summaryBudget,
      })
    : await fallbackSummary(oldMessages, summaryBudget);

  const summaryMessage = makeSummaryMessage(summaryText);
  return {
    compacted: true,
    summaryMessage,
    summaryText,
    messages: [summaryMessage, ...latestMessages],
  };
}

export function Defaultcompact({
  messages,
  maxMessages = DEFAULT_KEEP_LATEST_MESSAGES,
  contextWindow,
  compactBufferTokens,
  summaryReservedTokens,
}: DefaultCompactArgs): AgentMessage[] {
  if (
    !shouldCompact(messages, {
      keepLatestMessages: maxMessages,
      contextWindow,
      compactBufferTokens,
      summaryReservedTokens,
    })
  ) {
    return messages;
  }

  if (messages.length <= maxMessages + 1) {
    return messages;
  }

  // 同步兼容路径：不调用模型，仅保留最新消息窗口。
  return messages.slice(-(maxMessages));
}
