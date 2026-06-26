import { z } from "zod";

import { buildTool, lazySchema } from "../../../types/tool";

const inputSchema = lazySchema(() =>
  z.strictObject({
    pattern: z
      .string()
      .default("**/*")
      .describe("The glob pattern to match files against"),
    path: z
      .string()
      .default(".")
      .describe("Search directory. Defaults to current working directory."),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    requiredKeys: z.array(z.string()).default([]),
    keyTypes: z
      .record(
        z.string(),
        z.enum(["string", "number", "boolean", "object", "array"]),
      )
      .default({}),
  }),
);

export const defaultTool = buildTool({
  name: "default_tool",
  aliases: ["defaultTool"],
  maxResultSizeChars: 4000,
  strict: true,
  inputSchema: inputSchema(),
  outputSchema: outputSchema(),
  description: async (input) =>
    `Default tool with dedicated schemas. pattern=${input.pattern}, path=${input.path}`,
  isEnabled: () => true,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  interruptBehavior: () => "cancel",
  validateInput: async (input) => {
    if (input.pattern.trim().length === 0) {
      return { valid: false, reason: "pattern must not be empty" };
    }
    if (input.path.trim().length === 0) {
      return { valid: false, reason: "path must not be empty" };
    }
    return { valid: true };
  },
  checkPermissions: async () => ({ allowed: true }),
  call: async (args) => {
    const output = outputSchema().parse({
      requiredKeys: ["pattern", "path"],
      keyTypes: { pattern: "string", path: "string" },
    });

    return {
      ok: true,
      output,
    };
  },
});
