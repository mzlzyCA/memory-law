import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getWelcomeMessage } from "./index";
import {
  AgentMessageSnapshot,
  ensureCliStorageDirs,
  getAgentSessionTmpDir,
  getCliStorageDir,
  persistAgentSession,
} from "./writefile";
import type { AgentMessage } from "./types/messages";

describe("getWelcomeMessage", () => {
  it("returns default ready message", () => {
    expect(getWelcomeMessage()).toBe("memory-law CLI is ready.");
  });
});

describe("storage paths", () => {
  const tempHomes: string[] = [];

  afterEach(async () => {
    await Promise.all(tempHomes.map((dir) => rm(dir, { recursive: true, force: true })));
    tempHomes.length = 0;
  });

  it("uses ~/.memorylaw and ~/.memorylaw/tmp", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "memorylaw-home-"));
    tempHomes.push(fakeHome);
    const env = { ...process.env, HOME: fakeHome };

    expect(getCliStorageDir(env)).toBe(join(fakeHome, ".memorylaw"));
    expect(getAgentSessionTmpDir(env)).toBe(join(fakeHome, ".memorylaw", "tmp"));

    await ensureCliStorageDirs(env);
    const sessionFile = await persistAgentSession(
      {
        model: "openai:gpt-5",
        workspacePath: "/tmp/workspace",
        prompt: "hello",
        systemPrompt: "sys",
        description: "desc",
        tools: [],
        maxIterations: 1,
        outputs: ["world"],
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
      env,
    );

    expect(sessionFile.startsWith(join(fakeHome, ".memorylaw", "tmp"))).toBe(true);
    const data = JSON.parse(await readFile(sessionFile, "utf8")) as { outputs: string[] };
    expect(data.outputs).toEqual(["world"]);
  });

  it("stores agent message snapshot in ~/.memorylaw/tmp", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "memorylaw-home-"));
    tempHomes.push(fakeHome);
    const env = { ...process.env, HOME: fakeHome };

    const messages: AgentMessage[] = [
      {
        id: "m-1",
        type: "message",
        createdAt: new Date().toISOString(),
        message_type: "user_prompt",
        content: "hello",
      },
      {
        id: "m-2",
        type: "ui_message",
        createdAt: new Date().toISOString(),
        uiType: "cli_message",
        content: "hi",
      },
    ];

    const snapshotFile = await AgentMessageSnapshot(
      {
        model: "openai:gpt-5",
        workspacePath: "/tmp/workspace",
        messages,
        createdAt: new Date().toISOString(),
      },
      env,
    );

    expect(snapshotFile.startsWith(join(fakeHome, ".memorylaw", "tmp"))).toBe(true);
    const data = JSON.parse(await readFile(snapshotFile, "utf8")) as { messages: AgentMessage[] };
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0]?.type).toBe("message");
    expect(data.messages[1]?.type).toBe("ui_message");
  });
});
