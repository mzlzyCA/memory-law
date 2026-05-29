import "dotenv/config";

import { createProvider } from "../models";

async function main(): Promise<void> {
  const provider = createProvider("myprovider");
  const result = await provider.callModel({
    model: process.env.MYPROVIDER_MODEL ?? "gpt-4o-mini",
    systemPrompt: "你是一个简洁、准确的助手。",
    prompt: "请用不超过80字介绍上海人工智能实验室mineru的功能和特点。",
  });

  console.log("MyProvider response:");
  console.log(result.text);
}

main().catch((error: unknown) => {
  console.error("MyProvider test failed:", error);
  process.exit(1);
});
