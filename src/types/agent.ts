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
  /**
   * The type identifier for this agent.
   */
  agentType: string;

  /**
   * Tools available to this agent.
   */
  tools?: string[];

  /**
   * Tool name patterns that are explicitly allowed.
   */
  allowedTools?: string[];

  /**
   * Skill names to preload (parsed from comma-separated frontmatter todolist).
   */
  skills?: string[];

  /**
   * MCP servers specific to this agent todolist.
   */
  mcpServers?: AgentMcpServer[];

  /**
   * MCP server name patterns that must be configured for the agent to be available.
   */
  allowedMcpServers?: string[];

  /**
   * Session-scoped hooks registered when the agent starts.
   */
  hooks?: HooksSettings;

  /**
   * The model to use (e.g., "gemini:gemini-2.0-flash").
   */
  model: string;

  /**
   * Computational effort level for the model.
   */
  effort?: EffortValue;

  /**
   * Maximum number of agentic turns before stopping.
   */
  maxTurns?: number;

  /**
   * The base directory for the agent's operations.
   */
  baseDir?: string;

  /**
   * Prepended to the first user turn (slash commands work).
   */
  initialPrompt?: string;

  /**
   * Persistent memory scope todolist.
   */
  memory?: AgentMemoryScope;
}

/**
 * Default configuration values for a BaseAgent.
 */
export const DEFAULT_AGENT_CONFIG: Partial<BaseAgent> = {
  maxTurns: 30,
  effort: "medium",
  memory: "project",
};
