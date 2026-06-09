#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import { cwd } from "node:process";

import { runAgent, type RunAgentResult } from "./runAgent";
import {
  createGlobalStateStore,
  getGlobalState,
  type GlobalState,
} from "./storage/globalState";
import { DEFAULT_AGENT_CONFIG } from "./types/agent";
import type { AssistantMessage, UserMessage } from "./types/messages";
import {
  ensureCliStorageDirs,
  getAgentSessionTmpDir,
  getCliStorageDir,
} from "./writefile";

export function getWelcomeMessage(): string {
  return "memory-law CLI is ready.";
}

const DEFAULT_MODEL = "myprovider:gpt-4o-mini";
const DEFAULT_AGENT = "main";
const DEFAULT_MAX_ITERATIONS = 1;
const DEFAULT_SYSTEM_PROMPT =
  "You are Memory Law agent. Provide precise and actionable output.";

type ParsedCliArgs = {
  message: string;
  model: string;
  agentName: string;
  systemPrompt: string;
  maxIterations: number;
  workspacePath: string;
  description: string;
  verbose: boolean;
};

function parseCliArgs(argv: string[]): ParsedCliArgs {
  let model = DEFAULT_MODEL;
  let agentName = DEFAULT_AGENT;
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  let maxIterations = DEFAULT_MAX_ITERATIONS;
  let workspacePath = cwd();
  let description = "";
  let verbose = false;
  const messageTokens: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
    if (token === "--model" || token === "-m") {
      if (!next) {
        throw new Error("Missing value for --model");
      }
      model = next;
      i += 1;
      continue;
    }
    if (token === "--agent" || token === "-a") {
      if (!next) {
        throw new Error("Missing value for --agent");
      }
      agentName = next;
      i += 1;
      continue;
    }
    if (token === "--system" || token === "-s") {
      if (!next) {
        throw new Error("Missing value for --system");
      }
      systemPrompt = next;
      i += 1;
      continue;
    }
    if (token === "--max-iterations" || token === "-n") {
      if (!next) {
        throw new Error("Missing value for --max-iterations");
      }
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--max-iterations must be a positive integer");
      }
      maxIterations = parsed;
      i += 1;
      continue;
    }
    if (token === "--workspace" || token === "-w") {
      if (!next) {
        throw new Error("Missing value for --workspace");
      }
      workspacePath = next;
      i += 1;
      continue;
    }
    if (token === "--description" || token === "-d") {
      if (!next) {
        throw new Error("Missing value for --description");
      }
      description = next;
      i += 1;
      continue;
    }
    if (token === "--verbose" || token === "-v") {
      verbose = true;
      continue;
    }
    messageTokens.push(token);
  }

  const message = messageTokens.join(" ").trim();
  if (!message) {
    throw new Error("Missing CLI message. Pass it as trailing text.");
  }

  if (!description) {
    description = `CLI run for agent "${agentName}"`;
  }

  return {
    message,
    model,
    agentName,
    systemPrompt,
    maxIterations,
    workspacePath,
    description,
    verbose,
  };
}

function printUsage(): void {
  console.log(`Usage: bun src/index.ts [options] <message>

Options:
  -m, --model <model>             Model id, e.g. openai:gpt-5
  -a, --agent <name>              Agent name (default: ${DEFAULT_AGENT})
  -s, --system <prompt>           System prompt text
  -n, --max-iterations <number>   Iteration count (default: ${DEFAULT_MAX_ITERATIONS})
  -w, --workspace <path>          Workspace path (default: current directory)
  -d, --description <text>        Task description for model metadata
  -v, --verbose                   Verbose mode
  -h, --help                      Show this help
`);
}


function createAssistantMessage(model: string): AssistantMessage {
  return {
    uuid: randomUUID(),
    type: "assistant",
    timestamp: new Date().toISOString(),
    message: {
      id: randomUUID(),
      container: null,
      model,
      role: "assistant",
      stop_reason: null,
      stop_sequence: null,
      type: "message",
      usage: {},
      content: [{ type: "text", text: "Assistant context initialized." }],
      context_management: null,
    },
    isVirtual: true,
  };
}

function createUserMessage(prompt: string): UserMessage {
  return {
    uuid: randomUUID(),
    type: "user",
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: prompt,
    },
  };
}

function createRuntimeGlobalState(args: ParsedCliArgs): GlobalState {
  const store = createGlobalStateStore({
    verbose: args.verbose,
    agent: args.agentName,
    effortValue: DEFAULT_AGENT_CONFIG.effort,
    agentDefinitions: {
      [args.agentName]: {
        ...DEFAULT_AGENT_CONFIG,
        agentType: args.agentName,
        model: args.model,
        initialPrompt: args.systemPrompt,
      },
    },
  });
  return getGlobalState(store);
}

function buildSystemPrompt(baseSystemPrompt: string, state: GlobalState): string {
  return [
    baseSystemPrompt,
    `Current agent: ${state.agent ?? DEFAULT_AGENT}`,
    `Verbose: ${String(state.verbose)}`,
  ].join("\n");
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<{
  userMessage: UserMessage;
  globalState: GlobalState;
  result: RunAgentResult;
}> {
  const args = parseCliArgs(argv);
  const assistantMessage = createAssistantMessage(args.model);
  const userMessage = createUserMessage(args.message);
  const globalState = createRuntimeGlobalState(args);
  const systemPrompt = buildSystemPrompt(args.systemPrompt, globalState);

  await ensureCliStorageDirs();
  const result = await runAgent({
    model: args.model,
    workspacePath: args.workspacePath,
    max_iterations: args.maxIterations,
    prompt:
      typeof userMessage.message.content === "string"
        ? userMessage.message.content
        : JSON.stringify(userMessage.message.content),
    initialUserMessage: [assistantMessage, userMessage],
    systemPrompt,
    tools: [],
    description: args.description,
  });

  return { userMessage, globalState, result };
}

if (import.meta.main) {
  try {
    const { result, globalState, userMessage } = await main();
    console.log(getWelcomeMessage());
    console.log(`CLI storage: ${getCliStorageDir()}`);
    console.log(`Agent sessions tmp: ${getAgentSessionTmpDir()}`);
    console.log(`Agent: ${globalState.agent ?? DEFAULT_AGENT}`);
    console.log(`Message UUID: ${userMessage.uuid}`);
    console.log(result.message);
    const lastOutput = result.outputs.at(-1);
    if (lastOutput) {
      console.log("Agent reply:");
      console.log(lastOutput);
    } else {
      console.log("Agent reply: <empty>");
    }
    console.log(`Session saved to: ${result.sessionFilePath}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Unknown error while running CLI main.");
    }
    process.exit(1);
  }
}
