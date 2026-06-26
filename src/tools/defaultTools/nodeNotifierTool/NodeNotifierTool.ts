import { z } from "zod";

import { buildTool, lazySchema } from "../../../types/tool";

const inputSchema = lazySchema(() =>
  z.strictObject({
    title: z.string().default("Memory Law").describe("Notification title"),
    message: z.string().min(1).describe("Notification message body"),
    subtitle: z.string().optional().describe("Optional subtitle (macOS only)"),
    sound: z.boolean().default(false).describe("Play notification sound"),
    wait: z.boolean().default(false).describe("Wait for user action"),
    timeout: z.number().int().positive().optional().describe("Timeout in seconds"),
    open: z.string().optional().describe("URL or app to open when clicked"),
    appName: z.string().optional().describe("Application name shown by notifier"),
    icon: z.string().optional().describe("Absolute path to icon file"),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    delivered: z.boolean(),
    response: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
);

type NotifyOptions = {
  title: string;
  message: string;
  subtitle?: string;
  sound?: boolean;
  wait?: boolean;
  timeout?: number;
  open?: string;
  appName?: string;
  icon?: string;
};

type NodeNotifierModule = {
  default?: {
    notify: (
      options: NotifyOptions,
      callback?: (error: Error | null, response: string, metadata: unknown) => void,
    ) => void;
  };
  notify?: (
    options: NotifyOptions,
    callback?: (error: Error | null, response: string, metadata: unknown) => void,
  ) => void;
};

async function resolveNotifier(): Promise<
  (options: NotifyOptions, callback?: (error: Error | null, response: string, metadata: unknown) => void) => void
> {
  const moduleName = "node-notifier";
  const mod = (await import(moduleName)) as NodeNotifierModule;
  const notify = mod.default?.notify ?? mod.notify;
  if (!notify) {
    throw new Error("node-notifier loaded but notify() is unavailable");
  }
  return notify;
}

export const nodeNotifierTool = buildTool({
  name: "node_notifier",
  aliases: ["notify_desktop", "desktop_notify"],
  maxResultSizeChars: 4000,
  strict: true,
  inputSchema: inputSchema(),
  outputSchema: outputSchema(),
  description: async (input) =>
    `Send desktop notification: \"${input.title}\" - \"${input.message.slice(0, 60)}\"`,
  isEnabled: () => true,
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  interruptBehavior: () => "cancel",
  validateInput: async (input) => {
    if (input.message.trim().length === 0) {
      return { valid: false, reason: "message must not be empty" };
    }
    return { valid: true };
  },
  checkPermissions: async () => ({ allowed: true }),
  call: async (args) => {
    let notify: Awaited<ReturnType<typeof resolveNotifier>>;

    try {
      notify = await resolveNotifier();
    } catch {
      return {
        ok: false,
        error: 'Package "node-notifier" is not installed. Run: pnpm add node-notifier',
      };
    }

    const notifyOptions: NotifyOptions = {
      title: args.title,
      message: args.message,
      subtitle: args.subtitle,
      sound: args.sound,
      wait: args.wait,
      timeout: args.timeout,
      open: args.open,
      appName: args.appName,
      icon: args.icon,
    };

    const result = await new Promise<z.infer<ReturnType<typeof outputSchema>>>((resolve, reject) => {
      notify(notifyOptions, (error, response, metadata) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          outputSchema().parse({
            delivered: true,
            response,
            metadata:
              metadata && typeof metadata === "object"
                ? (metadata as Record<string, unknown>)
                : undefined,
          }),
        );
      });
    });

    return {
      ok: true,
      output: result,
    };
  },
});
