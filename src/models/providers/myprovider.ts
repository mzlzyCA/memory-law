import OpenAI from "openai";

import {
  composeSystemPrompt,
  type BaseModelProvider,
  type ModelRequest,
  type ModelResponse,
} from "../baseModel";

export class MyProvider implements BaseModelProvider {
  public readonly name = "myprovider";
  private readonly client: OpenAI;

  constructor(
    apiKey: string = process.env.OPENAI_API_KEY ?? "",
    baseURL: string = process.env.OPENAI_PROXY_BASE_URL ?? "https://api.openai-proxy.org/v1",
  ) {
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY for myprovider.");
    }
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  async callModel(request: ModelRequest): Promise<ModelResponse> {
    const systemPrompt = composeSystemPrompt(request.systemPrompt, request.metadata);
    const response = await this.client.responses.create({
      model: request.model,
      input: [
        ...(systemPrompt
          ? [{ role: "system" as const, content: [{ type: "input_text" as const, text: systemPrompt }] }]
          : []),
        { role: "user" as const, content: [{ type: "input_text" as const, text: request.prompt }] },
      ],
      temperature: request.temperature,
      max_output_tokens: request.maxTokens,
    });

    return {
      text: response.output_text ?? "",
      raw: response,
    };
  }
}
