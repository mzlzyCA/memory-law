import type { AgentMessage } from "../../types/messages";

export type DefaultCompactArgs = {
  messages: AgentMessage[];
  maxMessages?: number;
};

export function Defaultcompact({
  messages,
  maxMessages = 24,
}: DefaultCompactArgs): AgentMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  // TODO: Replace with smarter compact policy:
  // - prioritize system/user anchors
  // - keep unresolved tool chains
  // - preserve safety-critical context
  return messages.slice(-maxMessages);
}
