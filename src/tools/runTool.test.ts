import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { callTool } from "./runTool";
import { createInitialGlobalState } from "../storage/globalState";
import type {
  AssistantMessage,
  CanUseToolFn,
  Tool,
  ToolResult,
  ToolUseContext,
} from "../types/tool";

function makeContext(): ToolUseContext {
  return {
    options: {
      debug: false,
      tools: {},
      verbose: false,
      isNonInteractiveSession: false,
    },
    abortController: new AbortController(),
    readFileState: new Map(),
    getAppState: () => createInitialGlobalState(),
    setAppState: () => {},
    messages: [],
  };
}

function makeParentMessage(): AssistantMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "tool call",
    createdAt: new Date().toISOString(),
  };
}

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: "mock_tool",
    maxResultSizeChars: 10000,
    inputSchema: z.object({
      value: z.string(),
      _simulatedSedEdit: z.string().optional(),
    }),
    description: async () => "mock tool",
    isConcurrencySafe: () => true,
    isEnabled: () => true,
    isReadOnly: () => false,
    checkPermissions: async () => ({ allowed: true }),
    call: async (args) => ({ ok: true, output: args }),
    ...overrides,
  };
}

describe("callTool flow", () => {
  it("returns error when zod input validation fails", async () => {
    const tool = makeTool();
    const canUseTool: CanUseToolFn = async () => true;

    const result = await callTool({
      tool,
      input: { value: 123 },
      context: makeContext(),
      canUseTool,
      parentMessage: makeParentMessage(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid input for tool");
    }
  });

  it("returns error when validateInput fails", async () => {
    const callSpy = vi.fn(async () => ({ ok: true, output: {} as unknown }));
    const tool = makeTool({
      validateInput: async () => ({ valid: false, reason: "custom invalid" }),
      call: callSpy,
    });
    const canUseTool: CanUseToolFn = async () => true;

    const result = await callTool({
      tool,
      input: { value: "ok" },
      context: makeContext(),
      canUseTool,
      parentMessage: makeParentMessage(),
    });

    expect(result).toEqual({ ok: false, error: "custom invalid" });
    expect(callSpy).not.toHaveBeenCalled();
  });

  it("strips _simulatedSedEdit in pre-processing before call", async () => {
    const callSpy = vi.fn(async (args) => ({ ok: true, output: args }));
    const canUseTool = vi.fn(async () => true);
    const tool = makeTool({ call: callSpy });

    const result = await callTool({
      tool,
      input: { value: "ok", _simulatedSedEdit: "temp" },
      context: makeContext(),
      canUseTool,
      parentMessage: makeParentMessage(),
    });

    expect(result.ok).toBe(true);
    expect(callSpy).toHaveBeenCalledTimes(1);
    const firstArg = callSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstArg.value).toBe("ok");
    expect(firstArg).not.toHaveProperty("_simulatedSedEdit");
    expect(canUseTool).toHaveBeenCalledWith("mock_tool", { value: "ok" });
  });

  it("applies hookUpdatedInput and passes updated input to call", async () => {
    const callSpy = vi.fn(async (args) => ({ ok: true, output: args }));
    const tool = makeTool({ call: callSpy });

    async function* hooks() {
      yield { type: "hookUpdatedInput" as const, input: { value: "from-hook" } };
    }

    const result = await callTool({
      tool,
      input: { value: "origin" },
      context: makeContext(),
      canUseTool: async () => true,
      parentMessage: makeParentMessage(),
      runPreToolUseHooks: hooks,
    });

    expect(result.ok).toBe(true);
    const firstArg = callSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstArg.value).toBe("from-hook");
  });

  it("blocks execution on preventContinuation", async () => {
    const callSpy = vi.fn(async () => ({ ok: true, output: {} as unknown }));
    const tool = makeTool({ call: callSpy });

    async function* hooks() {
      yield { type: "preventContinuation" as const, reason: "blocked" };
    }

    const result = await callTool({
      tool,
      input: { value: "origin" },
      context: makeContext(),
      canUseTool: async () => true,
      parentMessage: makeParentMessage(),
      runPreToolUseHooks: hooks,
    });

    expect(result).toEqual({
      ok: false,
      error: "Tool execution blocked by pre-tool hook.",
    });
    expect(callSpy).not.toHaveBeenCalled();
  });

  it("returns immediately on hook stop result", async () => {
    const callSpy = vi.fn(async () => ({ ok: true, output: {} as unknown }));
    const tool = makeTool({ call: callSpy });
    const stopResult: ToolResult<unknown> = { ok: false, error: "stopped by hook" };

    async function* hooks() {
      yield { type: "stop" as const, result: stopResult };
    }

    const result = await callTool({
      tool,
      input: { value: "origin" },
      context: makeContext(),
      canUseTool: async () => true,
      parentMessage: makeParentMessage(),
      runPreToolUseHooks: hooks,
    });

    expect(result).toEqual(stopResult);
    expect(callSpy).not.toHaveBeenCalled();
  });
});
