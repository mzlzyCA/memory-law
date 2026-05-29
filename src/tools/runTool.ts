import { z } from "zod";
import {
  InputValidationError,
  type AssistantMessage,
  type CanUseToolFn,
  type PermissionResult,
  type PreToolUseHookEvent,
  type RunPreToolUseHooks,
  type Tool,
  type ToolResult,
  type ToolUseContext,
} from "../types/tool";

type UnknownObject = Record<string, unknown>;

async function* defaultRunPreToolUseHooks(): AsyncIterable<PreToolUseHookEvent> {
  // TODO: implement real pre-tool-use hooks pipeline.
  return;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function applyPreProcessing(input: UnknownObject): UnknownObject {
  const next = { ...input };

  // strip _simulatedSedEdit (internal simulation payload)
  if ("_simulatedSedEdit" in next) {
    delete next._simulatedSedEdit;
  }

  // bash classifier placeholder: reserved for future classifier metadata normalization.
  // backfill input placeholder: reserved for future default argument backfill.
  return next;
}

type CallToolArgs = {
  tool: Tool;
  input: UnknownObject;
  context: ToolUseContext;
  canUseTool: CanUseToolFn;
  parentMessage: AssistantMessage;
  runPreToolUseHooks?: RunPreToolUseHooks;
};

export async function callTool({
  tool,
  input,
  context,
  canUseTool,
  parentMessage,
  runPreToolUseHooks = defaultRunPreToolUseHooks,
}: CallToolArgs): Promise<ToolResult<unknown>> {
  let workingInput: UnknownObject = input;

  // 1) Input validation (Zod)
  const parsed = tool.inputSchema.safeParse(workingInput);
  if (!parsed.success) {
    const err = new InputValidationError(
      `Invalid input for tool "${tool.name}"`,
      parsed.error.issues,
    );
    return { ok: false, error: err.message };
  }
  workingInput = parsed.data as UnknownObject;

  // 2) Custom validation
  if (tool.validateInput) {
    const customValidation = await tool.validateInput(
      workingInput as z.infer<typeof tool.inputSchema>,
      context,
    );
    if (!customValidation.valid) {
      return { ok: false, error: customValidation.reason };
    }
  }

  // 3) Pre-processing (special logic)
  workingInput = applyPreProcessing(workingInput);

  // 4) PreToolUse hooks
  let hookPermissionResult: PermissionResult | undefined;
  let preventContinuation = false;

  for await (const event of runPreToolUseHooks({
    tool,
    input: workingInput,
    context,
    parentMessage,
  })) {
    switch (event.type) {
      case "message":
        if (context.options.verbose) {
          // Hook message is intentionally surfaced only in verbose mode.
          // eslint-disable-next-line no-console
          console.log(`[pre-tool-hook] ${event.message}`);
        }
        break;
      case "hookPermissionResult":
        hookPermissionResult = event.result;
        break;
      case "hookUpdatedInput":
        workingInput = event.input;
        break;
      case "preventContinuation":
        preventContinuation = true;
        break;
      case "stop":
        return event.result;
      default:
        break;
    }
  }

  if (preventContinuation) {
    return { ok: false, error: "Tool execution blocked by pre-tool hook." };
  }

  if (hookPermissionResult && !hookPermissionResult.allowed) {
    return { ok: false, error: hookPermissionResult.reason };
  }

  if (tool.checkPermissions) {
    const permission = await tool.checkPermissions(
      workingInput as z.infer<typeof tool.inputSchema>,
      context,
    );
    if (!permission.allowed) {
      return { ok: false, error: permission.reason };
    }
  }

  const allowed = await canUseTool(tool.name, workingInput);
  if (!allowed) {
    return { ok: false, error: `Tool "${tool.name}" is not allowed.` };
  }

  try {
    return await tool.call(
      workingInput as z.infer<typeof tool.inputSchema>,
      context,
      canUseTool,
      parentMessage,
    );
  } catch (error) {
    return {
      ok: false,
      error: `Tool "${tool.name}" execution failed: ${normalizeError(error)}`,
    };
  }
}
