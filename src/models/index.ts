import { type BaseModelProvider, type BuiltinProviderName } from "./baseModel";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { MyProvider } from "./providers/myprovider";
import { OpenAIProvider } from "./providers/openai";

export function parseProviderAndModel(input: string): {
  provider: BuiltinProviderName;
  model: string;
} {
  if (input.includes(":")) {
    const [provider, ...modelParts] = input.split(":");
    return normalize(provider, modelParts.join(":"));
  }
  if (input.includes("/")) {
    const [provider, ...modelParts] = input.split("/");
    return normalize(provider, modelParts.join("/"));
  }
  return { provider: "openai", model: input };
}

function normalize(provider: string, model: string): {
  provider: BuiltinProviderName;
  model: string;
} {
  if (provider === "openai" || provider === "claude" || provider === "gemini" || provider === "myprovider") {
    return { provider, model };
  }
  throw new Error(`Unsupported provider "${provider}". Use openai|claude|gemini|myprovider.`);
}

export function createProvider(name: BuiltinProviderName): BaseModelProvider {
  if (name === "openai") {
    return new OpenAIProvider();
  }
  if (name === "claude") {
    return new ClaudeProvider();
  }
  if (name === "myprovider") {
    return new MyProvider();
  }
  return new GeminiProvider();
}
