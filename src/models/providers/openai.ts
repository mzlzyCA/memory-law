import OpenAI from "openai";

import {
  composeSystemPrompt,
  type BaseModelProvider,
  type ModelRequest,
  type ModelResponse,
} from "../baseModel";

export class OpenAIProvider implements BaseModelProvider {
  public readonly name = "openai";
  private readonly client: OpenAI;

  getContextWindow(model: string): number {
    if (model.includes("gpt-4o") || model.includes("gpt-5")) {
      return 128_000;
    }
    return 32_000;
  }

  constructor(apiKey: string = process.env.OPENAI_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY for OpenAI provider.");
    }
    this.client = new OpenAI({ apiKey });
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
