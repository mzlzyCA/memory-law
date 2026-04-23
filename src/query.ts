import { createProvider, parseProviderAndModel } from "./models";

export interface QueryParams {
  model: string;
  prompt: string;
  systemPrompt: string;
  tools: unknown[];
  description: string;
  workspacePath: string;
  iteration: number;
  maxIterations: number;
}

export async function query(params: QueryParams): Promise<string> {
  const { provider, model } = parseProviderAndModel(params.model);
  const adapter = createProvider(provider);
  const response = await adapter.generate({
    model,
    prompt: params.prompt,
    systemPrompt: [
      params.systemPrompt,
      `Description: ${params.description}`,
      `Workspace: ${params.workspacePath}`,
      `Iteration: ${params.iteration}/${params.maxIterations}`,
      `Tools: ${JSON.stringify(params.tools)}`,
    ].join("\n\n"),
  });
  return response.text;
}
