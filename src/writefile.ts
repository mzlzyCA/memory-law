import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "./types/messages";

export const MEMORYLAW_DIRNAME = ".memorylaw";
export const AGENT_SESSIONS_TMP_DIRNAME = "tmp";
type RuntimeEnv = Record<string, string | undefined>;

export interface AgentSessionLog {
  model: string;
  workspacePath: string;
  prompt: string;
  systemPrompt: string;
  description: string;
  tools: unknown[];
  maxIterations: number;
  outputs: string[];
  startedAt: string;
  endedAt: string;
}

export interface AgentMessageSnapshot {
  model: string;
  workspacePath: string;
  messages: AgentMessage[];
  createdAt: string;
}

export function getCliStorageDir(env: RuntimeEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return join(home, MEMORYLAW_DIRNAME);
}

export function getAgentSessionTmpDir(env: RuntimeEnv = process.env): string {
  return join(getCliStorageDir(env), AGENT_SESSIONS_TMP_DIRNAME);
}

export async function ensureCliStorageDirs(env: RuntimeEnv = process.env): Promise<void> {
  await mkdir(getAgentSessionTmpDir(env), { recursive: true });
}

export async function persistAgentSession(
  session: AgentSessionLog,
  env: RuntimeEnv = process.env,
): Promise<string> {
  const sessionDir = getAgentSessionTmpDir(env);
  await mkdir(sessionDir, { recursive: true });

  const safeTs = new Date().toISOString().replaceAll(":", "-");
  const fileName = `session-${safeTs}-${randomUUID()}.json`;
  const filePath = join(sessionDir, fileName);

  await writeFile(filePath, JSON.stringify(session, null, 2), "utf8");
  return filePath;
}

export async function AgentMessageSnapshot(
  snapshot: AgentMessageSnapshot,
  env: RuntimeEnv = process.env,
): Promise<string> {
  const sessionDir = getAgentSessionTmpDir(env);
  await mkdir(sessionDir, { recursive: true });

  const safeTs = new Date().toISOString().replaceAll(":", "-");
  const fileName = `agent-message-snapshot-${safeTs}-${randomUUID()}.json`;
  const filePath = join(sessionDir, fileName);

  await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  return filePath;
}
