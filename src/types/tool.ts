import { z } from "zod";
import type { AgentMessage as Message } from "./messages"; // TODO: confirm final Message source type
import type { GlobalState } from "../storage/globalState";

export type AgentId = string;

export type AnyObject = z.AnyZodObject;

export type AppState = GlobalState;

export type FileStateCache = Map<string, unknown>;

export type ToolProgressData = Record<string, unknown>;

export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: P,
) => void | Promise<void>;

export type ToolInputJSONSchema = Record<string, unknown>;

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export type PermissionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export type ToolPermissionContext = {
  isTrustedSession?: boolean;
  isNonInteractiveSession?: boolean;
  requestedBy?: string;
};

export interface AssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  createdAt?: string;
}

export class InputValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = "InputValidationError";
    this.issues = issues;
  }
}

export type ToolResult<Output = unknown> =
  | { ok: true; output: Output }
  | { ok: false; error: string; output?: Output };

export type CanUseToolFn = (
  toolName: string,
  input?: Record<string, unknown>,
) => boolean | Promise<boolean>;

export type Tools = Record<string, Tool>;

export type PreToolUseHookEvent =
  | { type: "message"; message: string }
  | { type: "hookPermissionResult"; result: PermissionResult }
  | { type: "hookUpdatedInput"; input: Record<string, unknown> }
  | { type: "preventContinuation"; reason?: string }
  | { type: "stop"; result: ToolResult<unknown> };

export type RunPreToolUseHooks = (
  args: {
    tool: Tool;
    input: Record<string, unknown>;
    context: ToolUseContext;
    parentMessage: AssistantMessage;
  },
) => AsyncIterable<PreToolUseHookEvent>;

export type ToolUseContext = {
  options: {
    debug: boolean; // Debug mode switch
    tools: Tools; // Registered tools
    verbose: boolean; // Verbose output mode
    isNonInteractiveSession: boolean; // Whether this is a non-interactive session
  };
  abortController: AbortController; // Controller used to cancel tool execution
  readFileState: FileStateCache; // File read cache
  getAppState(): AppState; // Get current app state
  setAppState(f: (prev: AppState) => AppState): void; // Update app state
  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void; // Update app state for background tasks
  messages: Message[]; // Message history
  toolUseId?: string; // Current tool use id
  preserveToolUseResults?: boolean; // Whether tool results should be preserved
  agentId?: AgentId; // Sub-agent id
  agentType?: string; // Sub-agent type name
};

export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  aliases?: string[]; // Tool aliases
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>; // Core tool execution logic
  description(
    input: z.infer<Input>,
    options: {
      isNonInteractiveSession: boolean;
      toolPermissionContext: ToolPermissionContext;
      tools: Tools;
    },
  ): Promise<string>; // Build tool description text
  readonly inputSchema: Input; // Zod schema for tool input
  readonly inputJSONSchema?: ToolInputJSONSchema; // JSON schema for tool input
  outputSchema?: z.ZodType<unknown>; // Zod schema for tool output
  inputsEquivalent?(a: z.infer<Input>, b: z.infer<Input>): boolean; // Compare two inputs for semantic equivalence
  isConcurrencySafe(input: z.infer<Input>): boolean; // Whether parallel calls are safe
  isEnabled(): boolean; // Whether the tool is enabled
  isReadOnly(input: z.infer<Input>): boolean; // Whether the call is read-only
  isDestructive?(input: z.infer<Input>): boolean; // Whether the call is destructive
  interruptBehavior?(): "cancel" | "block"; // Behavior on interruption
  isMcp?: boolean; // Whether this is an MCP tool
  readonly shouldDefer?: boolean; // Whether loading can be deferred
  readonly alwaysLoad?: boolean; // Whether this tool should always be loaded
  mcpInfo?: { serverName: string; toolName: string }; // MCP server/tool metadata
  readonly name: string; // Unique tool name
  maxResultSizeChars: number; // Maximum output size
  readonly strict?: boolean; // Whether strict mode is enabled
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ValidationResult>; // Validate input before execution
  checkPermissions?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>; // Check runtime permissions before execution
};

export type DefaultableToolKeys =
  | "isEnabled"
  | "isConcurrencySafe"
  | "isReadOnly"
  | "isDestructive"
  | "checkPermissions";

export type ToolDef<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = Omit<Tool<Input, Output, P>, DefaultableToolKeys> &
  Partial<Pick<Tool<Input, Output, P>, DefaultableToolKeys>>;

const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (
    _input: Record<string, unknown>,
    _ctx: ToolUseContext,
  ): Promise<PermissionResult> => Promise.resolve({ allowed: true }),
};

type ToolDefaults = typeof TOOL_DEFAULTS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any, any, any>;

type BuiltTool<D> = Omit<D, DefaultableToolKeys> & {
  [K in DefaultableToolKeys]-?: K extends keyof D
    ? undefined extends D[K]
      ? ToolDefaults[K]
      : D[K]
    : ToolDefaults[K];
};

export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  return {
    ...TOOL_DEFAULTS,
    ...def,
  } as BuiltTool<D>;
}

export const lazySchema = <T extends z.ZodTypeAny>(factory: () => T) => factory;

export const toolInputSchema = lazySchema(() =>
  z.strictObject({
    pattern: z
      .string()
      .default("**/*")
      .describe("The glob pattern to match files against"),
    path: z
      .string()
      .default(".")
      .describe(
        'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
      ),
  }),
);

export type ToolInputSchema = ReturnType<typeof toolInputSchema>;
export type ToolInput = z.infer<ToolInputSchema>;

export const toolOutputSchema = lazySchema(() =>
  z.object({
    requiredKeys: z.array(z.string()).default([]),
    keyTypes: z
      .record(
        z.string(),
        z.enum(["string", "number", "boolean", "object", "array"]),
      )
      .default({}),
  }),
);

export type ToolOutputSchema = ReturnType<typeof toolOutputSchema>;
export type ToolOutput = z.infer<ToolOutputSchema>;
