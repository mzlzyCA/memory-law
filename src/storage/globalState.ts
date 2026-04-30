import type { BaseAgent, EffortValue } from "../types/agent";
import type { AgentId, ToolPermissionContext } from "../types/tool";

export type AgentDefinitionsResult = Record<string, Partial<BaseAgent>>;

/**
 * Global application state (working subset for this codebase).
 * Keep currently relevant keys active and leave the rest as commented placeholders.
 */
export type GlobalState = {
  // Active in current runtime context
  verbose: boolean; // Verbose output mode
  toolPermissionContext: ToolPermissionContext; // Tool permission context
  agent?: string; // Current agent name
  thinkingEnabled?: boolean; // Whether deep thinking mode is enabled
  fastMode?: boolean; // Whether fast mode is enabled
  effortValue?: EffortValue; // Selected reasoning effort level

  // Lightweight placeholders aligned with current task/agent workflow
  tasks: Record<string, unknown>; // Task state map
  todos: Record<AgentId, unknown>; // Todo lists grouped by agent id
  agentDefinitions: AgentDefinitionsResult; // Available agent definitions and config
  notifications: {
    current: unknown | null; // Currently visible notification
    queue: unknown[]; // FIFO notification queue
  };
  inbox: {
    messages: Array<{
      id: string;
      from: string;
      text: string;
      timestamp: string;
      status: "pending" | "processing" | "processed";
      color?: string;
      summary?: string;
    }>;
  };

  // Kept for compatibility with your original shape (currently not used in this repo)
  // settings: SettingsJson; // Application settings
  // mainLoopModel: ModelSetting; // Model used by the main loop
  // statusLineText?: string; // Status line text
  // expandedView: "none" | "tasks" | "teammates"; // Expanded panel type
  // isBriefOnly: boolean; // Whether brief-only output is enabled
  // spinnerTip?: string; // Loading spinner tip text
  // kairosEnabled: boolean; // Whether assistant mode is enabled
  // agentNameRegistry: Map<string, AgentId>; // Agent name -> id registry
  // foregroundedTaskId?: string; // Foreground task id
  // viewingAgentTaskId?: string; // Agent task currently being viewed
  // mcp: {
  //   clients: MCPServerConnection[]; // MCP client connections
  //   tools: Tool[]; // MCP tools
  //   commands: Command[]; // MCP commands
  //   resources: Record<string, ServerResource[]>; // MCP resources by server
  //   pluginReconnectKey: number; // Key used to trigger plugin reconnect
  // };
  // fileHistory: FileHistoryState; // Recent/opened file history
  // attribution: AttributionState; // Message/source attribution data
  // elicitation: {
  //   queue: ElicitationRequestEvent[]; // Pending user-input requests
  // };
  // sessionHooks: SessionHooksState; // Session lifecycle hooks state
  // promptSuggestion: {
  //   text: string | null;
  //   promptId: "user_intent" | "stated_intent" | null;
  //   shownAt: number;
  //   acceptedAt: number;
  //   generationRequestId: string | null;
  // }; // Suggested prompt state
  // speculation: SpeculationState; // Next-action speculation state
  // authVersion: number; // Auth version, incremented on login/logout
  // initialMessage: {
  //   message: UserMessage;
  //   clearContext?: boolean;
  //   mode?: PermissionMode;
  //   allowedPrompts?: AllowedPrompt[];
  // } | null; // Initial boot message
  // activeOverlays: ReadonlySet<string>; // Active overlay component keys
};

type Listener = () => void;
type OnChange<T> = (args: { newState: T; oldState: T }) => void;

export type Store<T> = {
  getState: () => T;
  setState: (updater: (prev: T) => T) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state;
      const next = updater(prev);
      if (Object.is(next, prev)) {
        return;
      }
      state = next;
      onChange?.({ newState: next, oldState: prev });
      for (const listener of listeners) {
        listener();
      }
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createInitialGlobalState(
  overrides: Partial<GlobalState> = {},
): GlobalState {
  return {
    verbose: false,
    toolPermissionContext: {},
    tasks: {},
    todos: {},
    agentDefinitions: {},
    notifications: {
      current: null,
      queue: [],
    },
    inbox: {
      messages: [],
    },
    ...overrides,
  };
}

export type GlobalStateStore = Store<GlobalState>;

export function createGlobalStateStore(
  initialState: Partial<GlobalState> = {},
  onChange?: OnChange<GlobalState>,
): GlobalStateStore {
  return createStore<GlobalState>(
    createInitialGlobalState(initialState),
    onChange,
  );
}

export function getGlobalState(store: GlobalStateStore): GlobalState {
  return store.getState();
}

export function setGlobalState(
  store: GlobalStateStore,
  updater: (prev: GlobalState) => GlobalState,
): void {
  store.setState(updater);
}
