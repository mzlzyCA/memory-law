import {
  composeSystemPrompt,
  type BaseModelProvider,
  type ModelRequest,
  type ModelResponse,
} from "../baseModel";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export class GeminiProvider implements BaseModelProvider {
  public readonly name = "gemini";
  private readonly apiKey: string;

  getContextWindow(model: string): number {
    if (model.includes("1.5") || model.includes("2.0")) {
      return 1_000_000;
    }
    return 128_000;
  }

  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY (or GOOGLE_API_KEY) for Gemini provider.");
    }
    this.apiKey = apiKey;
  }

  async callModel(request: ModelRequest): Promise<ModelResponse> {
    const systemPrompt = composeSystemPrompt(request.systemPrompt, request.metadata);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}`);
    }

    const raw = (await response.json()) as GeminiResponse;
    const text = (raw.candidates?.[0]?.content?.parts ?? [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");

    return { text, raw };
  }
}
