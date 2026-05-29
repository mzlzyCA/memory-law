import {
  composeSystemPrompt,
  type BaseModelProvider,
  type ModelRequest,
  type ModelResponse,
} from "../baseModel";

interface ClaudeResponse {
  content?: Array<{ type?: string; text?: string }>;
}

export class ClaudeProvider implements BaseModelProvider {
  public readonly name = "claude";
  private readonly apiKey: string;

  constructor(apiKey: string = process.env.ANTHROPIC_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY for Claude provider.");
    }
    this.apiKey = apiKey;
  }

  async callModel(request: ModelRequest): Promise<ModelResponse> {
    const systemPrompt = composeSystemPrompt(request.systemPrompt, request.metadata);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model,
        system: systemPrompt || undefined,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude request failed with status ${response.status}`);
    }

    const raw = (await response.json()) as ClaudeResponse;
    const text = (raw.content ?? [])
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text as string)
      .join("\n");

    return { text, raw };
  }
}
