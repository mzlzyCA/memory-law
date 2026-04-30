export type EffortValue = "low" | "medium" | "high";

export interface AgentMcpServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type AgentMemoryScope = "global" | "project" | "session";

export interface HooksSettings {
  [key: string]: unknown;
}

export interface BaseAgent {
  agentType: string; // The type identifier for this agent.
  tools?: string[]; // Tools available to this agent.
  allowedTools?: string[]; // Tool name patterns that are explicitly allowed.
  skills?: string[]; // Skill names to preload (parsed from comma-separated frontmatter todolist).
  mcpServers?: AgentMcpServer[]; // MCP servers specific to this agent todolist.
  allowedMcpServers?: string[]; // MCP server name patterns that must be configured for the agent to be available.
  hooks?: HooksSettings; // Session-scoped hooks registered when the agent starts.
  model: string; // The model to use (e.g., "gemini:gemini-2.0-flash").
  effort?: EffortValue; // Computational effort level for the model.
  maxTurns?: number; // Maximum number of agentic turns before stopping.
  baseDir?: string; // The base directory for the agent's operations.
  initialPrompt?: string; // Prepended to the first user turn (slash commands work).
  memory?: AgentMemoryScope; // Persistent memory scope todolist.
}

export const DEFAULT_AGENT_CONFIG: Partial<BaseAgent> = {
  maxTurns: 30,
  effort: "medium",
  memory: "project",
};
