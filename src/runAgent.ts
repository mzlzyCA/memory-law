import { query } from "./query";
import { persistAgentSession } from "./writefile";

export interface AgentParams {
  model: string;
  workspacePath: string;
  max_iterations: number;
  prompt: string;
  systemPrompt: string;
  tools: unknown[];
  description: string;
}

export interface RunAgentResult {
  success: boolean;
  message: string;
  iterationsCompleted: number;
  outputs: string[];
  sessionFilePath: string;
}

export async function runAgent(params: AgentParams): Promise<RunAgentResult> {
  const outputs: string[] = [];
  const startedAt = new Date().toISOString();
  const result = await query({
    model: params.model,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    tools: params.tools,
    description: params.description,
    workspacePath: params.workspacePath,
    iteration: 1,
    maxIterations: params.max_iterations,
  });
  outputs.push(...result.outputs);

  const endedAt = new Date().toISOString();
  const sessionFilePath = await persistAgentSession({
    model: params.model,
    workspacePath: params.workspacePath,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    description: params.description,
    tools: params.tools,
    maxIterations: params.max_iterations,
    outputs,
    startedAt,
    endedAt,
  });

  return {
    success: true,
    message: `Agent finished ${params.max_iterations} iterations with model "${params.model}".`,
    iterationsCompleted: outputs.length,
    outputs,
    sessionFilePath,
  };
}
