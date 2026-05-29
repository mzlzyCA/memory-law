import { callTool } from "./runTool";
import type {
  AssistantMessage,
  CanUseToolFn,
  Tool,
  ToolResult,
  ToolUseContext,
} from "../types/tool";

type ToolInput = Record<string, unknown>;

export type ArrangedToolCall = {
  tool: Tool;
  input: ToolInput;
};

export type RunToolsArgs = {
  calls: ArrangedToolCall[];
  context: ToolUseContext;
  canUseTool: CanUseToolFn;
  parentMessage: AssistantMessage;
  onEachResult?: (args: {
    call: ArrangedToolCall;
    result: ToolResult<unknown>;
    index: number;
  }) => void | Promise<void>;
};

export type PartitionResult = {
  readBatches: ArrangedToolCall[][];
  writeBatches: ArrangedToolCall[][];
};

export function createPartition(args: { calls: ArrangedToolCall[] }): PartitionResult {
  // TODO: implement real read/write partitioning and batching.
  // For now, return a placeholder structure and keep all calls in a single read batch.
  return args.calls.reduce<PartitionResult>(
    (partition, call) => {
      if (partition.readBatches.length === 0) {
        partition.readBatches.push([]);
      }
      partition.readBatches[0]?.push(call);
      return partition;
    },
    {
      readBatches: [],
      writeBatches: [],
    },
  );
}

export async function runToolsSerially({
  calls,
  context,
  canUseTool,
  parentMessage,
  onEachResult,
}: RunToolsArgs): Promise<ToolResult<unknown>[]> {
  return calls.reduce<Promise<ToolResult<unknown>[]>>(async (resultsPromise, call, index) => {
    const results = await resultsPromise;
    const result = await callTool({
      tool: call.tool,
      input: call.input,
      context,
      canUseTool,
      parentMessage,
    });

    if (onEachResult) {
      await onEachResult({ call, result, index });
    }

    results.push(result);
    return results;
  }, Promise.resolve([]));
}

export async function runToolsConcurrently({
  calls,
  context,
  canUseTool,
  parentMessage,
  onEachResult,
}: RunToolsArgs): Promise<ToolResult<unknown>[]> {
  const jobs = calls.map(async (call, index) => {
    const result = await callTool({
      tool: call.tool,
      input: call.input,
      context,
      canUseTool,
      parentMessage,
    });

    if (onEachResult) {
      await onEachResult({ call, result, index });
    }

    return result;
  });

  return Promise.all(jobs);
}

export async function runArrangedTools(args: RunToolsArgs): Promise<ToolResult<unknown>[]> {
  const partition = createPartition({ calls: args.calls });

  // TODO: use read/write batch strategy when partitioning is implemented.
  // For now, run the first available batch serially via the dedicated helper.
  const fallbackBatch = partition.readBatches[0] ?? partition.writeBatches[0] ?? [];

  return runToolsSerially({
    ...args,
    calls: fallbackBatch,
  });
}
